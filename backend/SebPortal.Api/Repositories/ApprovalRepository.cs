using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class ApprovalRepository(SebDbContext db)
{
    public async Task<List<ApprovalStep>> GetPendingApprovalsAsync(
        int tenantId)
    {
        return await db.ApprovalSteps
            .Include(step => step.Payment)
            .Where(step =>
                step.Status == "pending" &&
                step.Payment != null &&
                step.Payment.TenantId == tenantId &&
                step.Payment.Status == "pending_approval")
            .ToListAsync();
    }

    public async Task<ApprovalStep?> GetApprovalStepAsync(
        int approvalStepId)
    {
        return await db.ApprovalSteps
            .Include(step => step.Payment)
            .FirstOrDefaultAsync(step => step.Id == approvalStepId);
    }

    public async Task<User?> GetUserAsync(
        int userId,
        int tenantId)
    {
        return await db.Users
            .FirstOrDefaultAsync(user =>
                user.Id == userId &&
                user.TenantId == tenantId);
    }

    public async Task<int> GetPendingStepCountAsync(int paymentId)
    {
        return await db.ApprovalSteps
            .CountAsync(step =>
                step.PaymentId == paymentId &&
                step.Status == "pending");
    }

    public async Task SaveChangesAsync()
    {
        await db.SaveChangesAsync();
    }
}