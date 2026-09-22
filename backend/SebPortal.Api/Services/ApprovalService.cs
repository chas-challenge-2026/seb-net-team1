using SebPortal.Api.DTOs;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class ApprovalService(ApprovalRepository approvalRepository)
{
    public async Task<List<PendingApprovalDto>> GetPendingApprovalsAsync(
        int userId,
        int tenantId)
    {
        var user = await approvalRepository.GetUserAsync(userId, tenantId);

        if (user is null || user.Role != "admin")
        {
            throw new UnauthorizedAccessException(
                "Only admins can access pending approvals.");
        }

        var approvalSteps =
            await approvalRepository.GetPendingApprovalsAsync(tenantId);

        return approvalSteps
            .Where(step => step.Payment is not null)
            .Select(step => new PendingApprovalDto
            {
                ApprovalStepId = step.Id,
                PaymentId = step.Payment!.Id,
                StepNumber = step.StepNumber,
                Amount = step.Payment.Amount,
                Currency = step.Payment.Currency,
                ToIban = step.Payment.ToIban,
                Reference = step.Payment.Reference,
                PaymentStatus = step.Payment.Status,
                CreatedAt = step.Payment.CreatedAt
            })
            .ToList();
    }

    public async Task<bool> DecideApprovalAsync(
        int approvalStepId,
        int userId,
        int tenantId,
        string action,
        string? comment)
    {
        var user = await approvalRepository.GetUserAsync(userId, tenantId);

        if (user is null || user.Role != "admin")
        {
            throw new UnauthorizedAccessException(
                "Only admins can approve or reject payments.");
        }

        var approvalStep =
            await approvalRepository.GetApprovalStepAsync(approvalStepId);

        if (approvalStep is null || approvalStep.Payment is null)
        {
            return false;
        }

        var payment = approvalStep.Payment;

        if (payment.TenantId != tenantId)
        {
            return false;
        }

        if (approvalStep.Status != "pending")
        {
            return false;
        }

        if (payment.Status != "pending_approval")
        {
            return false;
        }

        if (action == "approve")
        {
            approvalStep.Status = "approved";
            approvalStep.DecidedAt = DateTime.UtcNow;
            approvalStep.Comment = comment;

            var remainingSteps =
                await GetRemainingPendingStepsAsync(payment.Id);

            if (remainingSteps == 0)
            {
                payment.Status = "completed";
                payment.ExecutedAt = DateTime.UtcNow;
            }
        }
        else if (action == "reject")
        {
            approvalStep.Status = "rejected";
            approvalStep.DecidedAt = DateTime.UtcNow;
            approvalStep.Comment = comment;

            payment.Status = "rejected";
        }
        else
        {
            return false;
        }

        await approvalRepository.SaveChangesAsync();

        return true;
    }

    private async Task<int> GetRemainingPendingStepsAsync(int paymentId)
    {
        return await approvalRepository.GetPendingStepCountAsync(paymentId);
    }
}