using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Signing;

namespace SebPortal.Api.Tests;

public class AuditLogFilteringTests
{
    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new SebDbContext(options);
        db.Tenants.AddRange(new Tenant { Id = 1, Name = "First company" },
            new Tenant { Id = 2, Name = "Second company" });
        db.Users.AddRange(
            new User { Id = 1, TenantId = 1, Name = "Sara Ek", Email = "sara@example.test" },
            new User { Id = 2, TenantId = 1, Name = "Johan Berg", Email = "johan@example.test" },
            new User { Id = 3, TenantId = 2, Name = "Other Tenant User", Email = "other@example.test" });
        db.SaveChanges();
        return db;
    }

    private static AuditService Service(SebDbContext db) =>
        new(new AuditRepository(db), new AuditLockProvider(), new UnsignedPlaceholderAuditSigner());

    private static AuditEntry Entry(int id, int tenantId = 1, int? userId = 1,
        string action = "CREATE_PAYMENT", string? description = "Hyra", int? entityId = 999,
        DateTime? createdAt = null) => new()
    {
        Id = id,
        TenantId = tenantId,
        UserId = userId,
        Action = action,
        EntityType = "payment",
        EntityId = entityId,
        Description = description,
        IpAddress = "2001:db8::1",
        CreatedAt = createdAt ?? new DateTime(2026, 10, 14, 10, 0, 0, DateTimeKind.Utc)
    };

    [Theory]
    [InlineData("sArA")]
    [InlineData("cReAtE_pAyMeNt")]
    [InlineData("Skapade en betalning")]
    [InlineData("sKaPaDe")]
    [InlineData(" HYRA ")]
    [InlineData("PaYmEnT")]
    [InlineData("DB8")]
    [InlineData("804")]
    [InlineData("999")]
    [InlineData("#804")]
    [InlineData("#999")]
    public async Task Search_MatchesTextWithoutCaseSensitivityOrNumericIds_WithinTenant(string search)
    {
        using var db = CreateContext();
        db.AuditEntries.AddRange(Entry(804), Entry(805, tenantId: 2, userId: 3));
        await db.SaveChangesAsync();

        var page = await Service(db).GetAuditLogAsync(1, 50, null,
            new AuditLogQuery { Search = search });

        Assert.Equal(804, Assert.Single(page.Entries).Id);
    }

    [Fact]
    public async Task Filters_CombineSearchActionUserAndDateRange()
    {
        using var db = CreateContext();
        var time = new DateTime(2026, 10, 14, 10, 0, 0, DateTimeKind.Utc);
        db.AuditEntries.AddRange(
            Entry(1, userId: 2, action: "APPROVE_PAYMENT", createdAt: time),
            Entry(2, userId: 1, action: "APPROVE_PAYMENT", createdAt: time),
            Entry(3, userId: 2, action: "CREATE_PAYMENT", createdAt: time),
            Entry(4, userId: 2, action: "APPROVE_PAYMENT", description: "El", createdAt: time),
            Entry(5, userId: 2, action: "APPROVE_PAYMENT", createdAt: time.AddDays(-1)),
            Entry(6, tenantId: 2, userId: 3, action: "APPROVE_PAYMENT", createdAt: time));
        await db.SaveChangesAsync();

        var page = await Service(db).GetAuditLogAsync(1, 50, null, new AuditLogQuery
        {
            Search = "hyra",
            Action = "APPROVE_PAYMENT",
            UserId = 2,
            From = new DateTimeOffset(time),
            To = new DateTimeOffset(time.AddDays(1))
        });

        Assert.Equal(1, Assert.Single(page.Entries).Id);
    }

    [Fact]
    public async Task FilteredPagination_SearchesBeyondFirstPage_WithoutSkippingMatchingRows()
    {
        using var db = CreateContext();
        for (var id = 1; id <= 15; id++)
        {
            db.AuditEntries.Add(Entry(id, description: id <= 9 && id % 2 == 1 ? "Match" : "Other"));
        }
        db.AuditEntries.Add(Entry(16, tenantId: 2, userId: 3, description: "Match"));
        await db.SaveChangesAsync();
        var service = Service(db);
        var filters = new AuditLogQuery { Search = "match" };

        var first = await service.GetAuditLogAsync(1, 2, null, filters);
        var second = await service.GetAuditLogAsync(1, 2, first.NextCursor, filters);
        var last = await service.GetAuditLogAsync(1, 2, second.NextCursor, filters);

        Assert.Equal(new[] { 9, 7 }, first.Entries.Select(entry => entry.Id));
        Assert.NotNull(first.NextCursor);
        Assert.Equal(new[] { 5, 3 }, second.Entries.Select(entry => entry.Id));
        Assert.NotNull(second.NextCursor);
        Assert.Equal(1, Assert.Single(last.Entries).Id);
        Assert.Null(last.NextCursor);
    }

    [Fact]
    public async Task DateRange_UsesUtcWithInclusiveStartAndExclusiveEnd_AndSystemFilter()
    {
        using var db = CreateContext();
        var start = new DateTime(2026, 10, 14, 10, 0, 0, DateTimeKind.Utc);
        db.AuditEntries.AddRange(
            Entry(1, userId: null, createdAt: start.AddTicks(-1)),
            Entry(2, userId: null, createdAt: start),
            Entry(3, userId: null, createdAt: start.AddMinutes(30).AddTicks(-1)),
            Entry(4, userId: null, createdAt: start.AddMinutes(30)),
            Entry(5, userId: 1, createdAt: start.AddMinutes(5)));
        await db.SaveChangesAsync();

        var page = await Service(db).GetAuditLogAsync(1, 50, null, new AuditLogQuery
        {
            UserId = 0,
            From = DateTimeOffset.Parse("2026-10-14T12:00:00+02:00"),
            To = DateTimeOffset.Parse("2026-10-14T12:30:00+02:00")
        });

        Assert.Equal(new[] { 3, 2 }, page.Entries.Select(entry => entry.Id));
        Assert.All(page.Entries, entry => Assert.Equal("Systemet", entry.UserName));
    }

    [Fact]
    public async Task EmptyOrWhitespaceSearch_DoesNotFilter_AndUnknownActionReturnsNoRows()
    {
        using var db = CreateContext();
        db.AuditEntries.Add(Entry(1));
        await db.SaveChangesAsync();
        var service = Service(db);

        Assert.Single((await service.GetAuditLogAsync(1, 50, null,
            new AuditLogQuery { Search = "   " })).Entries);
        Assert.Empty((await service.GetAuditLogAsync(1, 50, null,
            new AuditLogQuery { Action = "UNKNOWN_ACTION" })).Entries);
        Assert.Empty((await service.GetAuditLogAsync(1, 50, null,
            new AuditLogQuery { Action = "create_payment" })).Entries);
    }

    [Fact]
    public async Task Metadata_UsesEntireTenantHistory_DeduplicatesAndIncludesSystem()
    {
        using var db = CreateContext();
        db.AuditEntries.AddRange(
            Entry(1, action: "OLD_ACTION"),
            Entry(2, userId: 2, action: "APPROVE_PAYMENT"),
            Entry(3, userId: 2, action: "APPROVE_PAYMENT"),
            Entry(4, userId: null, action: "SYSTEM_EVENT"),
            Entry(5, tenantId: 2, userId: 3, action: "OTHER_TENANT_ACTION"));
        await db.SaveChangesAsync();
        var service = Service(db);
        await service.GetAuditLogAsync(1, 1, null, new AuditLogQuery { Action = "SYSTEM_EVENT" });

        var filters = await service.GetFiltersAsync(1);

        Assert.Equal(new[] { "APPROVE_PAYMENT", "OLD_ACTION", "SYSTEM_EVENT" }, filters.Actions);
        Assert.Equal(new[] { 2, 1, 0 }, filters.Users.Select(user => user.Id));
        Assert.Equal(new[] { "Johan Berg", "Sara Ek", "Systemet" }, filters.Users.Select(user => user.Name));
    }

    [Fact]
    public async Task CrossTenantUserReference_DoesNotExposeAnotherTenantsName()
    {
        using var db = CreateContext();
        db.AuditEntries.Add(Entry(1, userId: 3));
        await db.SaveChangesAsync();
        var service = Service(db);

        var filters = await service.GetFiltersAsync(1);
        var page = await service.GetAuditLogAsync(1, 50, null);
        var search = await service.GetAuditLogAsync(1, 50, null,
            new AuditLogQuery { Search = "Other Tenant User" });

        Assert.Empty(filters.Users);
        Assert.Equal("Systemet", Assert.Single(page.Entries).UserName);
        Assert.Empty(search.Entries);
    }

    [Fact]
    public async Task EmptyTenant_HasNoFilterOptions()
    {
        using var db = CreateContext();

        var filters = await Service(db).GetFiltersAsync(1);

        Assert.Empty(filters.Actions);
        Assert.Empty(filters.Users);
    }
}
