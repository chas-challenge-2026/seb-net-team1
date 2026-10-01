using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class AuditRepository(SebDbContext dbContext)
{    
    public Task<string?> GetLatestSignatureAsync(int tenantId) =>
        dbContext.AuditEntries
            .Where(entry => entry.TenantId == tenantId)
            .OrderByDescending(entry => entry.Id)
            .Select(entry => entry.Signature)
            .FirstOrDefaultAsync();

    public void Append(AuditEntry entry) =>
        dbContext.AuditEntries.Add(entry);

    public Task SaveChangesAsync() => dbContext.SaveChangesAsync();

    public Task<List<AuditEntry>> GetPageAsync(int tenantId, int limit, int? beforeId)
    {
        var query = dbContext.AuditEntries
            .Include(entry => entry.User)
            .Where(entry => entry.TenantId == tenantId);

        if (beforeId.HasValue)
        {
            query = query.Where(entry => entry.Id < beforeId.Value);
        }

        return query
            .OrderByDescending(entry => entry.Id)
            .Take(limit + 1)
            .ToListAsync();
    }
}