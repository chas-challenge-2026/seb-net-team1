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
            .Include(a => a.Transactions)
            .FirstOrDefaultAsync(a => a.Id == accountId && a.TenantId == tenantId);
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
}