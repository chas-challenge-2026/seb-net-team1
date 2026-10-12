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

    public async Task<Payment> AddPaymentAsync(Payment payment)
    {
        dbContext.Payments.Add(payment);
        await dbContext.SaveChangesAsync();

        return payment;
    }

    /// <summary>
    /// Tracks several payments without saving, so the caller can save them (and the
    /// account changes made with them) in one SaveChangesAsync.
    /// </summary>
    public void AddPayments(IEnumerable<Payment> payments)
    {
        dbContext.Payments.AddRange(payments);
    }

    public async Task SaveChangesAsync()
    {
        await dbContext.SaveChangesAsync();
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