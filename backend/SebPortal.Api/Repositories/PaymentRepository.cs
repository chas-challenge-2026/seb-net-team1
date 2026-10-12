using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
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
            .Include(a => a.Transactions)
            .FirstOrDefaultAsync(a => a.Id == accountId && a.TenantId == tenantId);
    }

    public async Task<Payment?> GetByIdempotencyKeyAsync(
        int tenantId,
        int createdById,
        string idempotencyKey)
    {
        return await dbContext.Payments
            .AsNoTracking()
            .FirstOrDefaultAsync(payment =>
                payment.TenantId == tenantId &&
                payment.CreatedById == createdById &&
                payment.IdempotencyKey == idempotencyKey);
    }

    public async Task<Payment> AddPaymentAsync(Payment payment)
    {
        dbContext.Payments.Add(payment);
        await dbContext.SaveChangesAsync();

        return payment;
    }

    public async Task SaveChangesAsync()
    {
        await dbContext.SaveChangesAsync();
    }

    public void ClearTrackedChanges()
    {
        dbContext.ChangeTracker.Clear();
    }

    /// <summary>
    /// Starts a database transaction so several saves either all happen or none do.
    /// Returns null on a provider without transactions (the in-memory database used
    /// by most unit tests). The real PostgreSQL behavior is covered by
    /// PaymentAuditAtomicityIntegrationTests.
    /// </summary>
    public async Task<IDbContextTransaction?> BeginTransactionAsync()
    {
        if (!dbContext.Database.IsRelational())
        {
            return null;
        }

        return await dbContext.Database.BeginTransactionAsync();
    }
}
