using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class DashboardRepository(SebDbContext db)
{
    public Task<User?> GetUserWithTenantAsync(int userId, int tenantId) =>
        db.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Id == userId && u.TenantId == tenantId);

    public Task<List<Account>> GetAccountsAsync(int tenantId) =>
        db.Accounts
            .Where(a => a.TenantId == tenantId)
            .ToListAsync();

    public Task<List<Payment>> GetPaymentsAsync(int tenantId) =>
        db.Payments
            .AsNoTracking()
            .Where(p => p.TenantId == tenantId)
            .Include(p => p.FromAccount)
            .Include(p => p.CreatedBy)
            .OrderByDescending(p => p.CreatedAt)
            .ThenByDescending(p => p.Id)
            .ToListAsync();

    public Task<List<Payment>> GetPendingApprovalsAsync(int tenantId) =>
        PendingPaymentsQuery(tenantId)
            .Include(payment => payment.FromAccount)
            .Include(payment => payment.CreatedBy)
            .OrderBy(p => p.CreatedAt)
            .ThenBy(p => p.Id)
            .ToListAsync();

    public Task<List<Payment>> GetUpcomingPaymentsAsync(int tenantId, int count) =>
        db.Payments
            .AsNoTracking()
            .Where(p => p.TenantId == tenantId &&
                (p.Status == PaymentStatuses.PendingApproval || p.Status == "processing"))
            .OrderBy(p => p.CreatedAt)
            .ThenBy(p => p.Id)
            .Take(count)
            .ToListAsync();

    public Task<int> GetPaymentCountAsync(int tenantId) =>
        db.Payments.AsNoTracking().CountAsync(p => p.TenantId == tenantId);

    public async Task<Dictionary<string, int>> GetPaymentStatusCountsAsync(int tenantId) =>
        await db.Payments
            .AsNoTracking()
            .Where(p => p.TenantId == tenantId)
            .GroupBy(p => p.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToDictionaryAsync(item => item.Status, item => item.Count);

    public Task<int> GetValidationErrorCountAsync(int tenantId) =>
        db.AuditEntries.AsNoTracking().CountAsync(entry =>
            entry.TenantId == tenantId && entry.Action == "VALIDATE_IBAN");

    public Task<List<AuditEntry>> GetRecentPaymentActivityAsync(int tenantId, int count) =>
        db.AuditEntries
            .AsNoTracking()
            .Include(entry => entry.User)
            .Where(entry => entry.TenantId == tenantId &&
                (entry.Action == "CREATE_PAYMENT" ||
                 entry.Action == "APPROVE_PAYMENT_STEP" ||
                 entry.Action == "APPROVE_PAYMENT" ||
                 entry.Action == "REJECT_PAYMENT" ||
                 entry.Action == "VALIDATE_IBAN"))
            .OrderByDescending(entry => entry.CreatedAt)
            .ThenByDescending(entry => entry.Id)
            .Take(count)
            .ToListAsync();

    private IQueryable<Payment> PendingPaymentsQuery(int tenantId) =>
        db.Payments
            .AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status == PaymentStatuses.PendingApproval);
}
