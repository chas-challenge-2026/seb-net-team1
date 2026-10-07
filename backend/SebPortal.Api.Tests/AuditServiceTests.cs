using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Signing;
using Xunit;

namespace SebPortal.Api.Tests;

public class AuditServiceTests
{
    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(options);
    }

    private static void SeedTenant(SebDbContext db, int tenantId, string name) =>
        db.Tenants.Add(new Tenant { Id = tenantId, Name = name });

    // Not real signing, see UnsignedPlaceholderAuditSigner. Fine for these
    // tests, which check the chaining, locking, and pagination logic, not
    // Emil's actual signing algorithm.
    private static IAuditSigner CreateSigner() => new UnsignedPlaceholderAuditSigner();

    private static AuditService CreateService(SebDbContext db) =>
        new(new AuditRepository(db), new AuditLockProvider(), CreateSigner());

    /// <summary>Same lock, try, finally shape as ApprovalService.DecideAsync.</summary>
    private static async Task AppendAndSaveAsync(
        AuditService service, SebDbContext db, int tenantId,
        int? userId, string action, string? entityType, int? entityId, string? description)
    {
        var tenantLock = service.GetTenantLock(tenantId);
        await tenantLock.WaitAsync();

        try
        {
            await service.AppendEntryAsync(tenantId, userId, action, entityType, entityId, description);
            await db.SaveChangesAsync();
        }
        finally
        {
            tenantLock.Release();
        }
    }

    [Fact]
    public async Task AppendEntryAsync_FirstEntryForTenant_ChainsFromGenesis()
    {
        using var db = CreateContext();
        SeedTenant(db, 1, "Runö Bygg AB");
        db.SaveChanges();

        var service = CreateService(db);
        await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", 1, "Test");

        var entry = Assert.Single(db.AuditEntries);
        Assert.Equal("GENESIS", entry.PreviousSignature);
        Assert.NotEmpty(entry.Signature);
    }

    [Fact]
    public async Task AppendEntryAsync_SecondEntry_ChainsFromFirstEntrysSignature()
    {
        using var db = CreateContext();
        SeedTenant(db, 1, "Runö Bygg AB");
        db.SaveChanges();

        var service = CreateService(db);
        await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", 1, "First");
        await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", 2, "Second");

        var entries = db.AuditEntries.OrderBy(e => e.Id).ToList();
        Assert.Equal(2, entries.Count);
        Assert.Equal("GENESIS", entries[0].PreviousSignature);
        Assert.Equal(entries[0].Signature, entries[1].PreviousSignature);
    }

    [Fact]
    public async Task AppendEntryAsync_ManyEntriesForOneTenant_KeepsEverySignatureShort()
    {
        // Regression test: when the placeholder returned the text itself, each
        // signature roughly doubled the next one, and entry 24 threw.
        using var db = CreateContext();
        SeedTenant(db, 1, "Runö Bygg AB");
        db.SaveChanges();

        var service = CreateService(db);
        for (var i = 1; i <= 30; i++)
        {
            await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", i, $"Entry {i}");
        }

        var entries = db.AuditEntries.ToList();
        Assert.Equal(30, entries.Count);
        Assert.All(entries, e => Assert.Equal(UnsignedPlaceholderAuditSigner.Marker, e.Signature));
    }

    [Fact]
    public async Task AppendEntryAsync_DifferentTenants_HaveIndependentChains()
    {
        using var db = CreateContext();
        SeedTenant(db, 1, "Tenant A");
        SeedTenant(db, 2, "Tenant B");
        db.SaveChanges();

        var service = CreateService(db);
        await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", 1, "A's entry");
        await AppendAndSaveAsync(service, db, 2, 9, "CREATE_PAYMENT", "payment", 1, "B's entry");

        var tenantBEntry = db.AuditEntries.Single(e => e.TenantId == 2);
        Assert.Equal("GENESIS", tenantBEntry.PreviousSignature); // not chained to tenant A's entry
    }

    [Fact]
    public async Task AppendEntryAsync_ProducesASignatureThatVerifiesAgainstTheSameCanonicalJson()
    {
        using var db = CreateContext();
        SeedTenant(db, 1, "Runö Bygg AB");
        db.SaveChanges();

        var signer = CreateSigner();
        var service = new AuditService(new AuditRepository(db), new AuditLockProvider(), signer);
        await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", 1, "Test");

        var entry = Assert.Single(db.AuditEntries);
        var canonicalJson = AuditSigningFormat.Build(entry, entry.PreviousSignature);

        Assert.True(signer.Verify(canonicalJson, entry.Signature));
    }

    // The placeholder cannot detect tampering, it never looks at the text.
    // A test that edits an entry after signing and expects Verify to fail belongs
    // with Emil's real signer. This one only checks what the placeholder promises.
    [Fact]
    public void Verify_OnlyAcceptsTheUnsignedMarker()
    {
        var signer = CreateSigner();
        var json = AuditSigningFormat.Build(
            new AuditEntry
            {
                TenantId = 1,
                UserId = 5,
                Action = "CREATE_PAYMENT",
                EntityType = "payment",
                EntityId = 1,
                Description = "Test",
                CreatedAt = DateTime.UtcNow
            },
            "GENESIS");

        Assert.True(signer.Verify(json, UnsignedPlaceholderAuditSigner.Marker));
        Assert.False(signer.Verify(json, "something else"));
    }

    [Fact]
    public void Build_WritesNullFieldsExplicitly_NotOmitted()
    {
        var entry = new AuditEntry
        {
            TenantId = 1,
            UserId = null,
            Action = "SYSTEM_EVENT",
            EntityType = null,
            EntityId = null,
            Description = null,
            CreatedAt = new DateTime(2026, 9, 29, 14, 32, 0, DateTimeKind.Utc)
        };

        var json = AuditSigningFormat.Build(entry, "GENESIS");

        Assert.Contains("\"UserId\":null", json);
        Assert.Contains("\"EntityType\":null", json);
        Assert.Contains("\"EntityId\":null", json);
        Assert.Contains("\"Description\":null", json);
        Assert.Contains("\"CreatedAt\":\"2026-09-29T14:32:00Z\"", json);
    }

    [Fact]
    public async Task GetTenantLock_SameTenant_BlocksASecondWaitUntilReleased()
    {
        var lockProvider = new AuditLockProvider();
        var service = new AuditService(new AuditRepository(CreateContext()), lockProvider, CreateSigner());

        var tenantLock = service.GetTenantLock(1);
        await tenantLock.WaitAsync();

        var secondWaitTask = tenantLock.WaitAsync();

        await Task.Delay(50); // give the second wait a chance to (wrongly) complete
        Assert.False(secondWaitTask.IsCompleted);

        tenantLock.Release();
        await secondWaitTask; // now unblocks
        tenantLock.Release();
    }

    [Fact]
    public async Task GetTenantLock_DifferentTenants_DoNotBlockEachOther()
    {
        var lockProvider = new AuditLockProvider();
        var service = new AuditService(new AuditRepository(CreateContext()), lockProvider, CreateSigner());

        var tenantOneLock = service.GetTenantLock(1);
        await tenantOneLock.WaitAsync();

        var tenantTwoLock = service.GetTenantLock(2);
        var tenantTwoWaitTask = tenantTwoLock.WaitAsync();

        // A regression to one lock shared across all tenants would hang forever
        // here instead of failing, so race it against a timeout and fail with a
        // clear message rather than letting the whole test run hang.
        var completed = await Task.WhenAny(tenantTwoWaitTask, Task.Delay(2000));
        Assert.True(completed == tenantTwoWaitTask, "Tenant 2 was blocked by tenant 1's lock.");

        tenantOneLock.Release();
        tenantTwoLock.Release();
    }

    [Fact]
    public async Task GetAuditLogAsync_ReturnsNewestFirst_AndSetsNextCursorWhenMoreExist()
    {
        using var db = CreateContext();
        SeedTenant(db, 1, "Runö Bygg AB");
        db.SaveChanges();

        var service = CreateService(db);
        for (var i = 1; i <= 5; i++)
        {
            await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", i, $"Entry {i}");
        }

        var page = await service.GetAuditLogAsync(1, limit: 2, cursor: null);

        Assert.Equal(2, page.Entries.Count);
        Assert.Equal("Entry 5", page.Entries[0].Description); // newest first
        Assert.Equal("Entry 4", page.Entries[1].Description);
        Assert.NotNull(page.NextCursor);
    }

    [Fact]
    public async Task GetAuditLogAsync_ExactlyLimitEntries_HasNoNextCursor()
    {
        // Boundary: exactly as many entries as the page size. There is nothing
        // left after this page, so NextCursor must be null, not "maybe more".
        using var db = CreateContext();
        SeedTenant(db, 1, "Runö Bygg AB");
        db.SaveChanges();

        var service = CreateService(db);
        for (var i = 1; i <= 3; i++)
        {
            await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", i, $"Entry {i}");
        }

        var page = await service.GetAuditLogAsync(1, limit: 3, cursor: null);

        Assert.Equal(3, page.Entries.Count);
        Assert.Null(page.NextCursor);
    }

    [Fact]
    public async Task GetAuditLogAsync_OneMoreThanLimit_HasNextCursor()
    {
        // Boundary one step over the one above: one entry more than the page
        // size. This is the line GetAuditLogAsync actually tests internally
        // (rows.Count > limit), so it needs a test sitting exactly on it, not
        // one comfortably on either side of it.
        using var db = CreateContext();
        SeedTenant(db, 1, "Runö Bygg AB");
        db.SaveChanges();

        var service = CreateService(db);
        for (var i = 1; i <= 4; i++)
        {
            await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", i, $"Entry {i}");
        }

        var page = await service.GetAuditLogAsync(1, limit: 3, cursor: null);

        Assert.Equal(3, page.Entries.Count); // still only 3 returned, the 4th only proves there's more
        Assert.NotNull(page.NextCursor);
    }

    [Fact]
    public async Task GetAuditLogAsync_LastPage_HasNoNextCursor()
    {
        using var db = CreateContext();
        SeedTenant(db, 1, "Runö Bygg AB");
        db.SaveChanges();

        var service = CreateService(db);
        await AppendAndSaveAsync(service, db, 1, 5, "CREATE_PAYMENT", "payment", 1, "Only entry");

        var page = await service.GetAuditLogAsync(1, limit: 50, cursor: null);

        Assert.Single(page.Entries);
        Assert.Null(page.NextCursor);
    }

    [Fact]
    public async Task GetAuditLogAsync_UsesSystemet_WhenEntryHasNoUser()
    {
        using var db = CreateContext();
        SeedTenant(db, 1, "Runö Bygg AB");
        db.SaveChanges();

        var service = CreateService(db);
        await AppendAndSaveAsync(service, db, 1, null, "SYSTEM_EVENT", null, null, "No user attached");

        var page = await service.GetAuditLogAsync(1, limit: 50, cursor: null);

        Assert.Equal("Systemet", page.Entries[0].UserName);
    }
}