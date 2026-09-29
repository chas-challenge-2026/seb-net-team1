using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;
using SebPortal.Api.Models;

namespace SebPortal.Api.Auditing;

/// <summary>
/// Signs new audit entries as part of the same SaveChanges that writes the business
/// change they describe, so a payment and its audit entry are committed together or
/// not at all.
///
/// For each tenant with new entries it takes a transaction scoped advisory lock,
/// reads the tenant's last chain position and hash, and assigns ChainIndex,
/// PreviousHash and Hash in order. The lock serializes concurrent writers, and the
/// unique (tenant_id, chain_index) index is a second line of defence against forks.
/// One instance per DbContext (registered as scoped).
/// </summary>
public sealed class AuditChainInterceptor(AuditSigningKeyProvider keyProvider) : SaveChangesInterceptor
{
    /// <summary>Advisory lock key (class, tenant id) that serializes audit writers per tenant.</summary>
    public const int AdvisoryLockClass = 727_001;
    public const string AdvisoryLockSql = "SELECT pg_advisory_xact_lock({0}, {1})";

    private IDbContextTransaction? _ownedTransaction;

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        var context = eventData.Context;
        var newEntries = NewEntries(context);
        if (context is null || newEntries.Count == 0)
        {
            return result;
        }

        var relational = context.Database.IsRelational();
        if (relational && context.Database.CurrentTransaction is null)
        {
            _ownedTransaction = context.Database.BeginTransaction();
        }

        foreach (var tenantEntries in newEntries.GroupBy(entry => entry.TenantId))
        {
            if (relational)
            {
                context.Database.ExecuteSqlRaw(AdvisoryLockSql, AdvisoryLockClass, tenantEntries.Key);
            }

            var last = LastLinkQuery(context, tenantEntries.Key).FirstOrDefault();
            Sign(tenantEntries, last?.ChainIndex ?? 0, last?.Hash);
        }

        return result;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        var context = eventData.Context;
        var newEntries = NewEntries(context);
        if (context is null || newEntries.Count == 0)
        {
            return result;
        }

        var relational = context.Database.IsRelational();
        if (relational && context.Database.CurrentTransaction is null)
        {
            _ownedTransaction = await context.Database.BeginTransactionAsync(cancellationToken);
        }

        foreach (var tenantEntries in newEntries.GroupBy(entry => entry.TenantId))
        {
            if (relational)
            {
                await context.Database.ExecuteSqlRawAsync(
                    AdvisoryLockSql, [AdvisoryLockClass, tenantEntries.Key], cancellationToken);
            }

            var last = await LastLinkQuery(context, tenantEntries.Key).FirstOrDefaultAsync(cancellationToken);
            Sign(tenantEntries, last?.ChainIndex ?? 0, last?.Hash);
        }

        return result;
    }

    public override int SavedChanges(SaveChangesCompletedEventData eventData, int result)
    {
        if (_ownedTransaction is not null)
        {
            _ownedTransaction.Commit();
            _ownedTransaction.Dispose();
            _ownedTransaction = null;
        }

        return result;
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        if (_ownedTransaction is not null)
        {
            await _ownedTransaction.CommitAsync(cancellationToken);
            await _ownedTransaction.DisposeAsync();
            _ownedTransaction = null;
        }

        return result;
    }

    public override void SaveChangesFailed(DbContextErrorEventData eventData)
    {
        if (_ownedTransaction is not null)
        {
            _ownedTransaction.Rollback();
            _ownedTransaction.Dispose();
            _ownedTransaction = null;
        }
    }

    public override async Task SaveChangesFailedAsync(
        DbContextErrorEventData eventData,
        CancellationToken cancellationToken = default)
    {
        if (_ownedTransaction is not null)
        {
            await _ownedTransaction.RollbackAsync(cancellationToken);
            await _ownedTransaction.DisposeAsync();
            _ownedTransaction = null;
        }
    }

    private static List<AuditEntry> NewEntries(DbContext? context) =>
        context is null
            ? []
            : context.ChangeTracker.Entries<AuditEntry>()
                .Where(entry => entry.State == EntityState.Added)
                .Select(entry => entry.Entity)
                .ToList();

    private sealed record ChainLink(long ChainIndex, string Hash);

    private static IQueryable<ChainLink> LastLinkQuery(DbContext context, int tenantId) =>
        context.Set<AuditEntry>()
            .AsNoTracking()
            .Where(entry => entry.TenantId == tenantId && entry.ChainIndex > 0)
            .OrderByDescending(entry => entry.ChainIndex)
            .Select(entry => new ChainLink(entry.ChainIndex, entry.Hash));

    /// <summary>
    /// Links the entries in the order the events happened (a stable sort, so entries
    /// recorded at the same instant keep the order they were added in).
    /// </summary>
    private void Sign(IEnumerable<AuditEntry> entries, long lastChainIndex, string? lastHash)
    {
        var hasher = keyProvider.Hasher;
        var chainIndex = lastChainIndex;
        var previousHash = lastHash ?? AuditHasher.GenesisHash;

        foreach (var entry in entries.OrderBy(e => e.CreatedAt))
        {
            entry.CreatedAt = AuditHasher.NormalizeTimestamp(entry.CreatedAt);
            entry.ChainIndex = ++chainIndex;
            entry.PreviousHash = previousHash;
            entry.Hash = hasher.ComputeHash(entry);
            previousHash = entry.Hash;
        }
    }
}
