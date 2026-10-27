using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public sealed record AuditLogFilter(string? Action = null, string? EntityType = null, int? EntityId = null);

public class AuditLogRepository(SebDbContext db)
{
    /// <summary>
    /// Newest first, scoped by the entry's own tenant_id (v1 had no tenant filtering
    /// on audit entries at all).
    /// </summary>
    public Task<List<AuditEntry>> GetForTenantAsync(int tenantId, int limit, int? beforeId, AuditLogFilter? filter = null)
    {
        var query = db.AuditEntries
            .AsNoTracking()
            .Include(e => e.User)
            .Where(e => e.TenantId == tenantId)
            .Where(e => beforeId == null || e.Id < beforeId);

        if (!string.IsNullOrWhiteSpace(filter?.Action))
        {
            query = query.Where(e => e.Action == filter.Action);
        }

        if (!string.IsNullOrWhiteSpace(filter?.EntityType))
        {
            query = query.Where(e => e.EntityType == filter.EntityType);
        }

        if (filter?.EntityId is { } entityId)
        {
            query = query.Where(e => e.EntityId == entityId);
        }

        return query
            .OrderByDescending(e => e.Id)
            .Take(limit)
            .ToListAsync();
    }

    /// <summary>The whole chain of a tenant in chain order, streamed so large logs do not load at once.</summary>
    public IAsyncEnumerable<AuditEntry> StreamChainAsync(int tenantId) =>
        db.AuditEntries
            .AsNoTracking()
            .Where(e => e.TenantId == tenantId)
            .OrderBy(e => e.ChainIndex)
            .ThenBy(e => e.Id)
            .AsAsyncEnumerable();

    public Task<List<int>> GetTenantIdsAsync() =>
        db.AuditEntries.Select(e => e.TenantId).Distinct().ToListAsync();
}
