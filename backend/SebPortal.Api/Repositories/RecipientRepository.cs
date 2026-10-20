using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class RecipientRepository(SebDbContext dbContext)
{
    public const string UniqueIbanIndexName = "ux_recipients_tenant_iban";

    public Task<List<Recipient>> GetForTenantAsync(int tenantId) =>
        dbContext.Recipients.AsNoTracking()
            .Where(recipient => recipient.TenantId == tenantId)
            .OrderBy(recipient => recipient.Name)
            .ThenBy(recipient => recipient.Id)
            .ToListAsync();

    public Task<bool> ExistsAsync(int tenantId, string iban) =>
        dbContext.Recipients.AnyAsync(recipient =>
            recipient.TenantId == tenantId && recipient.Iban == iban);

    public Task<string?> GetNameByIbanAsync(int tenantId, string iban) =>
        dbContext.Recipients.AsNoTracking()
            .Where(recipient => recipient.TenantId == tenantId && recipient.Iban == iban)
            .Select(recipient => recipient.Name)
            .FirstOrDefaultAsync();

    public async Task AddAsync(Recipient recipient)
    {
        dbContext.Recipients.Add(recipient);
        await dbContext.SaveChangesAsync();
    }

    public Task SaveChangesAsync() => dbContext.SaveChangesAsync();

    public void ClearTrackedChanges() => dbContext.ChangeTracker.Clear();

    public async Task<IDbContextTransaction?> BeginTransactionAsync() =>
        dbContext.Database.IsRelational()
            ? await dbContext.Database.BeginTransactionAsync()
            : null;
}
