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

    public Task<List<Payment>> GetRecentPaymentsAsync(int tenantId, int count) =>
        db.Payments
            .Where(p => p.TenantId == tenantId)
            .OrderByDescending(p => p.CreatedAt)
            .Take(count)
            .ToListAsync();

    public async Task<List<Payment>> GetPendingApprovalsAsync(int userId, int tenantId)
    {
        var payments = await db.ApprovalSteps
            .Where(step => step.AttestantId == userId && step.Status == "pending")
            .Include(step => step.Payment)
            .Select(step => step.Payment)
            .ToListAsync();

        return payments
            .Where(p => p is not null && p.TenantId == tenantId)
            .Select(p => p!)
            .ToList();
    }
}