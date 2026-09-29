using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class PaymentRepository(SebDbContext dbContext)
{
    public async Task<Account?> GetAccountAsync(
        int accountId,
        int tenantId)
    {
        return await dbContext.Accounts
            .FirstOrDefaultAsync(a => a.Id == accountId && a.TenantId == tenantId);
    }

    public Task<List<Account>> GetAccountsAsync(int tenantId, IReadOnlyCollection<int> accountIds) =>
        dbContext.Accounts
            .Where(a => a.TenantId == tenantId && accountIds.Contains(a.Id))
            .ToListAsync();

    /// <summary>
    /// Money already promised to payments that are waiting for attest. It is still
    /// on the account, but new payments must not be allowed to use it.
    /// </summary>
    public async Task<decimal> GetReservedAmountAsync(int accountId)
    {
        var amounts = await dbContext.Payments
            .Where(p => p.FromAccountId == accountId && p.Status == PaymentStatuses.PendingApproval)
            .Select(p => p.Amount)
            .ToListAsync();

        return amounts.Sum();
    }

    public async Task<Dictionary<int, decimal>> GetReservedAmountsAsync(int tenantId)
    {
        var pending = await dbContext.Payments
            .Where(p => p.TenantId == tenantId && p.Status == PaymentStatuses.PendingApproval)
            .Select(p => new { p.FromAccountId, p.Amount })
            .ToListAsync();

        return pending
            .GroupBy(p => p.FromAccountId)
            .ToDictionary(g => g.Key, g => g.Sum(p => p.Amount));
    }

    public Task<Payment?> FindByIdempotencyKeyAsync(int tenantId, int userId, string idempotencyKey) =>
        dbContext.Payments
            .AsNoTracking()
            .FirstOrDefaultAsync(p =>
                p.TenantId == tenantId &&
                p.CreatedById == userId &&
                p.IdempotencyKey == idempotencyKey);

    public Task<List<Payment>> FindByIdempotencyKeyPrefixAsync(int tenantId, int userId, string prefix) =>
        dbContext.Payments
            .AsNoTracking()
            .Where(p =>
                p.TenantId == tenantId &&
                p.CreatedById == userId &&
                p.IdempotencyKey != null &&
                p.IdempotencyKey.StartsWith(prefix))
            .OrderBy(p => p.Id)
            .ToListAsync();

    public void AddPayment(Payment payment) => dbContext.Payments.Add(payment);

    public async Task<Payment> AddPaymentAsync(Payment payment)
    {
        dbContext.Payments.Add(payment);
        await dbContext.SaveChangesAsync();

        return payment;
    }

    public void AddAuditEntry(AuditEntry entry) => dbContext.AuditEntries.Add(entry);

    /// <summary>Forgets every tracked entity, so a retried operation starts from fresh database values.</summary>
    public void ResetTracking() => dbContext.ChangeTracker.Clear();

    public async Task SaveChangesAsync()
    {
        await dbContext.SaveChangesAsync();
    }
}
