using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

/// <summary>
/// Decides who attests the next step of a payment and tells them. Used both when a
/// payment is created (step 1) and when a step is approved on a payment that needs
/// double approval (step 2), so the rules live in one place:
/// never the creator, never someone who already decided a step on the payment,
/// only active attestants (preferred) or admins. When nobody qualifies the step is
/// left unassigned and every eligible admin is notified. v1 fell back to the same
/// attestant for step 2, which let one person approve a payment twice.
/// </summary>
public class ApprovalAssignmentService(ApprovalRepository approvalRepository, NotificationService notificationService)
{
    public async Task<ApprovalStep> CreateNextStepAsync(Payment payment, IReadOnlyCollection<ApprovalStep> existingSteps)
    {
        var excludedUserIds = ExcludedUserIds(payment, existingSteps);

        var attestantId = await approvalRepository.FindNextAttestantIdAsync(payment.TenantId, excludedUserIds);

        var step = new ApprovalStep
        {
            Payment = payment,
            AttestantId = attestantId,
            StepNumber = existingSteps.Count + 1,
            Status = ApprovalStatuses.Pending
        };

        payment.ApprovalSteps.Add(step);
        return step;
    }

    /// <summary>
    /// Notifies whoever can act on the step. Call after the payment has been saved,
    /// so the notification can link to its id.
    /// </summary>
    public async Task NotifyAsync(Payment payment, ApprovalStep step, IReadOnlyCollection<ApprovalStep> allSteps, int totalSteps)
    {
        if (step.AttestantId is { } attestantId)
        {
            notificationService.ApprovalRequested(payment, attestantId, step.StepNumber, totalSteps);
            return;
        }

        var excluded = ExcludedUserIds(payment, allSteps.Where(s => s != step).ToList());
        foreach (var adminId in await approvalRepository.GetActiveAdminIdsAsync(payment.TenantId, excluded))
        {
            notificationService.ApprovalRequested(payment, adminId, step.StepNumber, totalSteps);
        }
    }

    private static List<int> ExcludedUserIds(Payment payment, IEnumerable<ApprovalStep> steps) =>
        steps
            .Select(s => s.AttestantId)
            .Append(payment.CreatedById)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToList();
}
