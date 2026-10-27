using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

/// <summary>
/// Data access for the approval inbox (US-25/US-26). Replaces the raw, string
/// interpolated Npgsql commands in v1's ApprovalInbox.cshtml.cs, which were both
/// SQL injectable and impossible to test.
/// </summary>
public class ApprovalRepository(SebDbContext dbContext)
{
    /// <summary>
    /// Pending steps assigned to one attestant, inside their own tenant.
    /// The attestant id comes from the JWT, never from the request body.
    /// </summary>
    public Task<List<ApprovalStep>> GetPendingStepsForAttestantAsync(int userId, int tenantId) =>
        PendingStepsQuery(tenantId)
            .Where(step => step.AttestantId == userId && step.Payment!.CreatedById != userId)
            .ToListAsync();

    /// <summary>
    /// Every pending step in a tenant that the admin may decide: everything except
    /// the admin's own payments (four-eyes principle). Attestants only see their own steps.
    /// </summary>
    public Task<List<ApprovalStep>> GetPendingStepsForTenantAsync(int tenantId, int? excludeCreatedById = null) =>
        PendingStepsQuery(tenantId)
            .Where(step => excludeCreatedById == null || step.Payment!.CreatedById != excludeCreatedById)
            .ToListAsync();

    private IQueryable<ApprovalStep> PendingStepsQuery(int tenantId) =>
        dbContext.ApprovalSteps
            .Include(step => step.Payment!).ThenInclude(payment => payment.CreatedBy)
            .Include(step => step.Payment!).ThenInclude(payment => payment.FromAccount)
            .Include(step => step.Payment!).ThenInclude(payment => payment.ApprovalSteps)
                .ThenInclude(approvalStep => approvalStep.Attestant)
            .Include(step => step.Payment!).ThenInclude(payment => payment.ApprovalSteps)
                .ThenInclude(approvalStep => approvalStep.DecidedBy)
            .Where(step =>
                step.Status == ApprovalStatuses.Pending &&
                step.Payment != null &&
                step.Payment.TenantId == tenantId &&
                step.Payment.Status == PaymentStatuses.PendingApproval)
            .OrderBy(step => step.Payment!.CreatedAt);

    /// <summary>
    /// Handled steps assigned to this user or directly decided by them, newest first.
    /// </summary>
    public Task<List<ApprovalStep>> GetHandledStepsForAttestantAsync(int userId, int tenantId, int limit) =>
        dbContext.ApprovalSteps
            .Include(step => step.Payment!).ThenInclude(payment => payment.ApprovalSteps)
                .ThenInclude(approvalStep => approvalStep.Attestant)
            .Include(step => step.Payment!).ThenInclude(payment => payment.ApprovalSteps)
                .ThenInclude(approvalStep => approvalStep.DecidedBy)
            .Where(step =>
                (step.AttestantId == userId || step.DecidedById == userId) &&
                step.Status != ApprovalStatuses.Pending &&
                step.DecidedAt != null &&
                step.Payment != null &&
                step.Payment.TenantId == tenantId)
            .OrderByDescending(step => step.DecidedAt)
            .Take(limit)
            .ToListAsync();

    /// <summary>
    /// One step, found by the id clients see (PublicId), with everything needed to decide it: the payment and the account
    /// the money would leave (including its transactions, so completing the payment
    /// can append one).
    /// </summary>
    public Task<ApprovalStep?> GetStepWithPaymentAsync(Guid approvalStepId) =>
        dbContext.ApprovalSteps
            .Include(step => step.Payment!).ThenInclude(payment => payment.FromAccount!).ThenInclude(account => account.Transactions)
            .FirstOrDefaultAsync(step => step.PublicId == approvalStepId);

    /// <summary>All steps belonging to one payment, ordered by step number.</summary>
    public Task<List<ApprovalStep>> GetStepsForPaymentAsync(int paymentId) =>
        dbContext.ApprovalSteps
            .Where(step => step.PaymentId == paymentId)
            .OrderBy(step => step.StepNumber)
            .ToListAsync();

    /// <summary>
    /// Finds an active attestant (or admin) in the tenant who can take the next
    /// approval step, skipping anyone who must not decide it themselves. Attestants
    /// are preferred over admins. Returns null when the tenant has nobody left, in
    /// which case the step is left unassigned and only an admin can pick it up.
    /// </summary>
    public async Task<int?> FindNextAttestantIdAsync(int tenantId, IReadOnlyCollection<int> excludedUserIds)
    {
        var candidates = await dbContext.Users
            .Where(user =>
                user.TenantId == tenantId &&
                user.IsActive &&
                (user.Role == UserRoles.Attestant || user.Role == UserRoles.Admin) &&
                !excludedUserIds.Contains(user.Id))
            .Select(user => new { user.Id, user.Role })
            .ToListAsync();

        return candidates
            .OrderBy(user => user.Role == UserRoles.Attestant ? 0 : 1)
            .ThenBy(user => user.Id)
            .Select(user => (int?)user.Id)
            .FirstOrDefault();
    }

    public Task<User?> GetUserAsync(int userId) =>
        dbContext.Users.FirstOrDefaultAsync(user => user.Id == userId);

    public Task<List<int>> GetActiveAdminIdsAsync(int tenantId, IReadOnlyCollection<int> excludedUserIds) =>
        dbContext.Users
            .Where(user =>
                user.TenantId == tenantId &&
                user.IsActive &&
                user.Role == UserRoles.Admin &&
                !excludedUserIds.Contains(user.Id))
            .Select(user => user.Id)
            .ToListAsync();

    public void AddApprovalStep(ApprovalStep step) =>
        dbContext.ApprovalSteps.Add(step);

    public Task SaveChangesAsync() => dbContext.SaveChangesAsync();
}
