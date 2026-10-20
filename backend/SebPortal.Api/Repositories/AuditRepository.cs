using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class AuditRepository(SebDbContext dbContext)
{
    // Include the event labels displayed in the Swedish audit UI in free-text searches.
    private static readonly Dictionary<string, string> ActionLabels = new()
    {
        ["CREATE_RECIPIENT"] = "Lade till en mottagare",
        ["CREATE_PAYMENT"] = "Skapade en betalning",
        ["APPROVE_PAYMENT"] = "Godkände en betalning",
        ["APPROVE_PAYMENT_STEP"] = "Godkände ett atteststeg",
        ["REJECT_PAYMENT"] = "Avvisade en betalning"
    };

    public Task<string?> GetLatestSignatureAsync(int tenantId) =>
        dbContext.AuditEntries
            .Where(entry => entry.TenantId == tenantId)
            .OrderByDescending(entry => entry.Id)
            .Select(entry => entry.Signature)
            .FirstOrDefaultAsync();

    public void Append(AuditEntry entry) =>
        dbContext.AuditEntries.Add(entry);

    public Task SaveChangesAsync() => dbContext.SaveChangesAsync();

    public Task<List<AuditEntry>> GetPageAsync(
        int tenantId, int limit, int? beforeId, AuditLogQuery? filters = null)
    {
        var query = dbContext.AuditEntries
            .AsNoTracking()
            .Include(entry => entry.User)
            .Where(entry => entry.TenantId == tenantId);

        if (filters?.Action is not null)
        {
            query = query.Where(entry => entry.Action == filters.Action);
        }

        if (filters?.UserId is int userId)
        {
            query = userId == 0
                ? query.Where(entry => entry.UserId == null)
                : query.Where(entry => entry.UserId == userId);
        }

        if (filters?.From is DateTimeOffset from)
        {
            var fromUtc = from.UtcDateTime;
            query = query.Where(entry => entry.CreatedAt >= fromUtc);
        }

        if (filters?.To is DateTimeOffset to)
        {
            var toUtc = to.UtcDateTime;
            query = query.Where(entry => entry.CreatedAt < toUtc);
        }

        if (!string.IsNullOrWhiteSpace(filters?.Search))
        {
            var search = filters.Search.Trim().ToLowerInvariant();
            var hasNumericId = int.TryParse(search.TrimStart('#'), out var numericId);
            var matchingActions = ActionLabels
                .Where(action => action.Value.Contains(search, StringComparison.OrdinalIgnoreCase))
                .Select(action => action.Key).ToArray();

            // Lower/Contains translates to SQL on PostgreSQL as well as the test
            // provider. Keep every filter in the query before paging the results.
            query = query.Where(entry =>
                (entry.User != null && entry.User.TenantId == tenantId &&
                    entry.User.Name.ToLower().Contains(search)) ||
                (entry.UserId == null && "systemet".Contains(search)) ||
                matchingActions.Contains(entry.Action) ||
                entry.Action.ToLower().Contains(search) ||
                (entry.Description != null && entry.Description.ToLower().Contains(search)) ||
                (entry.EntityType != null && entry.EntityType.ToLower().Contains(search)) ||
                (entry.IpAddress != null && entry.IpAddress.ToLower().Contains(search)) ||
                (hasNumericId && (entry.Id == numericId || entry.EntityId == numericId)));
        }

        if (beforeId.HasValue)
        {
            query = query.Where(entry => entry.Id < beforeId.Value);
        }

        return query
            .OrderByDescending(entry => entry.Id)
            .Take(limit + 1)
            .ToListAsync();
    }

    public async Task<AuditLogFiltersDto> GetFiltersAsync(int tenantId)
    {
        var query = dbContext.AuditEntries.AsNoTracking()
            .Where(entry => entry.TenantId == tenantId);

        var actions = await query.Select(entry => entry.Action)
            .Distinct().OrderBy(action => action).ToListAsync();

        var users = await query
            .Where(entry => entry.UserId == null ||
                (entry.User != null && entry.User.TenantId == tenantId))
            .Select(entry => new AuditLogUserFilterDto
            {
                Id = entry.UserId ?? 0,
                Name = entry.UserId == null ? "Systemet" : entry.User!.Name
            })
            .Distinct().OrderBy(user => user.Name).ThenBy(user => user.Id).ToListAsync();

        return new AuditLogFiltersDto { Actions = actions, Users = users };
    }

    public Task<List<AuditEntry>> GetPaymentEntriesAsync(int paymentId, int tenantId) =>
        dbContext.AuditEntries
            .AsNoTracking()
            .Include(entry => entry.User)
            .Where(entry => entry.TenantId == tenantId &&
                entry.EntityType == "payment" && entry.EntityId == paymentId)
            .OrderBy(entry => entry.CreatedAt)
            .ThenBy(entry => entry.Id)
            .ToListAsync();
}
