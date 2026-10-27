using SebPortal.Api.Auditing;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>
/// The tamper evident audit chain: every entry is HMAC signed and linked to the
/// previous entry of its tenant, and verification finds the first broken entry.
/// </summary>
public class AuditChainTests
{
    private static SebDbContext SeedChain(int entries = 4)
    {
        var db = TestServices.CreateContext(withAuditChain: true);
        db.Tenants.AddRange(new Tenant { Id = 1, Name = "Malmö Bygg AB" }, new Tenant { Id = 2, Name = "Annat AB" });
        db.Users.Add(new User { Id = 1, TenantId = 1, Name = "Lisa Persson", Email = "lisa@malmobygg.se", Role = UserRoles.Initiator });
        db.SaveChanges();

        for (var i = 1; i <= entries; i++)
        {
            db.AuditEntries.Add(Audit.Entry(1, 1, AuditActions.CreatePayment, AuditEntityTypes.Payment, i, $"Betalning #{i}"));
            db.SaveChanges();
        }

        return db;
    }

    [Fact]
    public void SavedEntries_AreNumberedAndChained()
    {
        using var db = SeedChain();

        var chain = db.AuditEntries.OrderBy(e => e.ChainIndex).ToList();

        Assert.Equal(new long[] { 1, 2, 3, 4 }, chain.Select(e => e.ChainIndex));
        Assert.Equal(AuditHasher.GenesisHash, chain[0].PreviousHash);
        for (var i = 1; i < chain.Count; i++)
        {
            Assert.Equal(chain[i - 1].Hash, chain[i].PreviousHash);
        }
        Assert.All(chain, e => Assert.Matches("^[0-9a-f]{64}$", e.Hash));
    }

    [Fact]
    public void EntriesSavedTogether_KeepTheirOrder()
    {
        using var db = SeedChain(entries: 0);

        var first = Audit.Entry(1, 1, AuditActions.CreatePayment, AuditEntityTypes.Payment, 1, "Först");
        var second = Audit.Entry(1, 1, AuditActions.ApprovePayment, AuditEntityTypes.Payment, 1, "Sedan");
        second.CreatedAt = first.CreatedAt.AddTicks(10);
        db.AuditEntries.AddRange(second, first);
        db.SaveChanges();

        Assert.Equal(1, db.AuditEntries.Single(e => e.Description == "Först").ChainIndex);
        Assert.Equal(2, db.AuditEntries.Single(e => e.Description == "Sedan").ChainIndex);
    }

    [Fact]
    public void EachTenantHasItsOwnChain()
    {
        using var db = SeedChain(entries: 2);

        db.AuditEntries.Add(Audit.Entry(2, null, AuditActions.CreatePayment, AuditEntityTypes.Payment, 99, "Annan tenant"));
        db.SaveChanges();

        var other = db.AuditEntries.Single(e => e.TenantId == 2);
        Assert.Equal(1, other.ChainIndex);
        Assert.Equal(AuditHasher.GenesisHash, other.PreviousHash);
    }

    [Fact]
    public async Task VerifyChainAsync_AcceptsAnIntactChain()
    {
        using var db = SeedChain();

        var status = await TestServices.AuditLogService(db).VerifyChainAsync(1);

        Assert.True(status.Valid);
        Assert.Equal(4, status.CheckedCount);
        Assert.Null(status.FirstInvalidEntryId);
    }

    [Fact]
    public async Task VerifyChainAsync_FindsAnEditedEntry()
    {
        using var db = SeedChain();
        var tampered = db.AuditEntries.Single(e => e.ChainIndex == 3);

        // Someone with database access rewrites history.
        tampered.Description = "Betalning #3 (ändrad)";
        await db.SaveChangesAsync();

        var status = await TestServices.AuditLogService(db).VerifyChainAsync(1);

        Assert.False(status.Valid);
        Assert.Equal(tampered.Id, status.FirstInvalidEntryId);
    }

    [Fact]
    public async Task VerifyChainAsync_FindsADeletedEntry()
    {
        using var db = SeedChain();
        var removed = db.AuditEntries.Single(e => e.ChainIndex == 2);
        var next = db.AuditEntries.Single(e => e.ChainIndex == 3);

        db.AuditEntries.Remove(removed);
        await db.SaveChangesAsync();

        var status = await TestServices.AuditLogService(db).VerifyChainAsync(1);

        Assert.False(status.Valid);
        Assert.Equal(next.Id, status.FirstInvalidEntryId);
    }

    [Fact]
    public async Task VerifyChainAsync_FindsAForgedHash()
    {
        using var db = SeedChain();
        var forged = db.AuditEntries.Single(e => e.ChainIndex == 4);

        // Recomputing with another key does not help without the real signing key.
        forged.Description = "Förfalskad";
        forged.Hash = AuditHasher.FromSecret("en-helt-annan-nyckel-som-ar-lang-nog-123").ComputeHash(forged);
        await db.SaveChangesAsync();

        var status = await TestServices.AuditLogService(db).VerifyChainAsync(1);

        Assert.False(status.Valid);
        Assert.Equal(forged.Id, status.FirstInvalidEntryId);
    }

    [Fact]
    public void NormalizeTimestamp_TruncatesToMicrosecondsInUtc()
    {
        var value = new DateTime(2026, 9, 29, 12, 0, 0, DateTimeKind.Utc).AddTicks(1234567);

        var normalized = AuditHasher.NormalizeTimestamp(value);

        Assert.Equal(DateTimeKind.Utc, normalized.Kind);
        Assert.Equal(0, normalized.Ticks % 10);
        Assert.Equal(value.Ticks - 7, normalized.Ticks);
    }
}
