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
            .AsNoTracking()
            .Where(a => a.TenantId == tenantId)
            .OrderBy(a => a.Id)
            .ToListAsync();

    public Task<List<Payment>> GetRecentPaymentsAsync(int tenantId, int count) =>
        db.Payments
            .AsNoTracking()
            .Where(p => p.TenantId == tenantId)
            .OrderByDescending(p => p.CreatedAt)
            .ThenByDescending(p => p.Id)
            .Take(count)
            .ToListAsync();

    /// <summary>
    /// Payments waiting for this user's decision. For admins this also includes steps
    /// nobody could be assigned to, but never the admin's own payments.
    /// </summary>
    public async Task<List<Payment>> GetPendingApprovalsAsync(int userId, int tenantId, bool includeUnassigned = false)
    {
        var payments = await db.ApprovalSteps
            .AsNoTracking()
            .Where(step =>
                step.Status == ApprovalStatuses.Pending &&
                (step.AttestantId == userId || (includeUnassigned && step.AttestantId == null)) &&
                step.Payment != null &&
                step.Payment.TenantId == tenantId &&
                step.Payment.Status == PaymentStatuses.PendingApproval &&
                step.Payment.CreatedById != userId)
            .Select(step => step.Payment)
            .ToListAsync();

        return payments
            .Where(p => p is not null)
            .Select(p => p!)
            .DistinctBy(p => p.Id)
            .OrderBy(p => p.CreatedAt)
            .ToList();
    }

    /// <summary>Amounts and statuses of every payment since a date, for the KPI cards.</summary>
    public async Task<List<(string Status, decimal Amount)>> GetPaymentsSinceAsync(int tenantId, DateTime since)
    {
        var rows = await db.Payments
            .AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.CreatedAt >= since)
            .Select(p => new { p.Status, p.Amount })
            .ToListAsync();

        return rows.Select(r => (r.Status, r.Amount)).ToList();
    }

    public Task<int> CountPendingPaymentsAsync(int tenantId) =>
        db.Payments.CountAsync(p => p.TenantId == tenantId && p.Status == PaymentStatuses.PendingApproval);

    public async Task<Dictionary<int, (decimal Amount, int Count)>> GetReservedByAccountAsync(int tenantId)
    {
        var pending = await db.Payments
            .AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.Status == PaymentStatuses.PendingApproval)
            .Select(p => new { p.FromAccountId, p.Amount })
            .ToListAsync();

        return pending
            .GroupBy(p => p.FromAccountId)
            .ToDictionary(g => g.Key, g => (g.Sum(p => p.Amount), g.Count()));
    }
}
