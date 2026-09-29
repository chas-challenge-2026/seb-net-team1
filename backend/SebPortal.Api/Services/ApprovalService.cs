using SebPortal.Api.Auditing;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

/// <summary>
/// All attest logic for the approval inbox (US-26). v1 kept this inline in a
/// 500+ line PageModel (Pages/ApprovalInbox.cshtml.cs) together with SQL, email
/// sending and three hardcoded thresholds. Here the controller only maps HTTP,
/// the repository only talks to the database, and the rules live in one place.
/// See contracts/approvals-contract.md.
/// </summary>
public class ApprovalService(
    ApprovalRepository approvalRepository,
    PaymentService paymentService,
    ApprovalAssignmentService approvalAssignment,
    NotificationService notificationService)
{
    public const string ApproveAction = "approve";
    public const string RejectAction = "reject";

    /// <summary>Matches the approval_steps.comment column length.</summary>
    public const int MaxCommentLength = 255;

    private const int RecentlyHandledCount = 50;

    /// <summary>
    /// Builds the attestant's inbox: steps still waiting for them, plus the ones
    /// they have already decided.
    /// </summary>
    /// <param name="tenantId">Tenant from the JWT.</param>
    /// <param name="userId">User from the JWT. Never a client supplied id (BUG-011).</param>
    /// <param name="role">Role from the JWT. Admins see the whole tenant's pending steps, except their own payments.</param>
    public async Task<ApprovalInboxResponse> GetInboxAsync(int tenantId, int userId, string? role)
    {
        var pendingSteps = IsAdmin(role)
            ? await approvalRepository.GetPendingStepsForTenantAsync(tenantId, excludeCreatedById: userId)
            : await approvalRepository.GetPendingStepsForAttestantAsync(userId, tenantId);

        var handledSteps = await approvalRepository.GetHandledStepsForAttestantAsync(
            userId, tenantId, RecentlyHandledCount);

        return new ApprovalInboxResponse
        {
            Pending = pendingSteps.Select(ToPendingApprovalDto).ToList(),
            RecentlyHandled = handledSteps.Select(ToHandledApprovalDto).ToList()
        };
    }

    /// <summary>
    /// Approves or rejects one approval step and moves the payment along with it.
    /// </summary>
    /// <param name="approvalStepId">The step to decide, from the route.</param>
    /// <param name="request">The decision and an optional comment.</param>
    /// <param name="tenantId">Tenant from the JWT.</param>
    /// <param name="userId">User from the JWT.</param>
    /// <param name="role">Role from the JWT.</param>
    public async Task<ApprovalDecisionResponseDto> DecideAsync(
        int approvalStepId,
        ApprovalDecisionRequestDto request,
        int tenantId,
        int userId,
        string? role)
    {
        var action = NormalizeAction(request.Action);
        var comment = NormalizeComment(request.Comment);

        var step = await approvalRepository.GetStepWithPaymentAsync(approvalStepId)
            ?? throw new ApprovalStepNotFoundException(approvalStepId);

        var payment = step.Payment
            ?? throw new PaymentNotFoundException(step.PaymentId);

        // A step in another tenant is reported as "not found", not as "forbidden".
        // Answering 403 would confirm that the id exists, which is a cross tenant
        // information leak. v1 let an admin decide steps in any tenant at all.
        if (payment.TenantId != tenantId)
        {
            throw new ApprovalStepNotFoundException(approvalStepId);
        }

        // Four-eyes principle: not even an admin attests their own payment.
        if (payment.CreatedById == userId)
        {
            throw new OwnPaymentApprovalException(payment.Id, userId);
        }

        // Fixes BUG-011 (IDOR): the step must actually be assigned to the caller.
        // v1 trusted the approvalStepId from a hidden form field, so any attestant
        // could decide someone else's step. Admins may still act on any step inside
        // their own tenant.
        if (step.AttestantId != userId && !IsAdmin(role))
        {
            throw new ApprovalStepAccessDeniedException(approvalStepId, userId);
        }

        if (step.Status != ApprovalStatuses.Pending)
        {
            throw new ApprovalStepAlreadyDecidedException(approvalStepId, step.Status);
        }

        if (payment.Status != PaymentStatuses.PendingApproval)
        {
            throw new PaymentAlreadyCompletedException(payment.Id, payment.Status);
        }

        var steps = await approvalRepository.GetStepsForPaymentAsync(payment.Id);

        // One person can only approve one of the steps, otherwise double approval
        // means nothing (v1 assigned both steps to the same attestant).
        if (steps.Any(s => s.Id != step.Id && s.AttestantId == userId && s.Status == ApprovalStatuses.Approved))
        {
            throw new ApprovalStepAccessDeniedException(approvalStepId, userId);
        }

        // Record who actually decided. When an admin takes over someone else's step
        // this also keeps them out of the next step.
        step.AttestantId = userId;

        var decidedBy = await approvalRepository.GetUserAsync(userId);
        var decidedByName = decidedBy?.Name ?? "en attestant";

        if (action == ApproveAction)
        {
            await ApproveAsync(step, payment, steps, userId, comment);
        }
        else
        {
            Reject(step, payment, steps, userId, decidedByName, comment);
        }

        await approvalRepository.SaveChangesAsync();

        return new ApprovalDecisionResponseDto
        {
            PaymentId = payment.Id,
            ApprovalStepId = step.Id,
            StepStatus = step.Status,
            PaymentStatus = payment.Status
        };
    }

    private async Task ApproveAsync(ApprovalStep step, Payment payment, List<ApprovalStep> steps, int userId, string? comment)
    {
        step.Status = ApprovalStatuses.Approved;
        step.DecidedAt = DateTime.UtcNow;
        step.Comment = comment;

        var requiredSteps = paymentService.RequiredApprovalSteps(payment.Amount);
        var approvedSteps = steps.Count(s => s.Status == ApprovalStatuses.Approved);
        var pendingSteps = steps.Count(s => s.Status == ApprovalStatuses.Pending);

        // Double approval is sequential: step 2 is created when step 1 is approved, and
        // this is also the safety net for a payment created with fewer steps than the
        // rule requires (BUG-006). We never complete a payment on fewer approvals than
        // the rule asks for, and we never leave it stuck either: the missing step is
        // created and assigned so someone can still act on it.
        if (pendingSteps == 0 && approvedSteps < requiredSteps)
        {
            var nextStep = await approvalAssignment.CreateNextStepAsync(payment, steps);
            approvalRepository.AddApprovalStep(nextStep);
            await approvalAssignment.NotifyAsync(payment, nextStep, [.. steps, nextStep], requiredSteps);
            pendingSteps = 1;
        }

        if (pendingSteps > 0)
        {
            approvalRepository.AddAuditEntry(Audit.Entry(
                payment.TenantId,
                userId,
                AuditActions.ApprovePaymentStep,
                AuditEntityTypes.Payment,
                payment.Id,
                $"Atteststeg {step.StepNumber} godkänt för betalning #{payment.Id} " +
                $"({Money.Display(payment.Amount)} {payment.Currency}). {pendingSteps} steg kvar." +
                (comment is null ? string.Empty : $" Kommentar: {comment}")));

            return;
        }

        // Last approval: the money actually moves here. Reuses the same completion
        // logic as a direct payment, so status, balance, timestamp and transaction
        // history stay consistent between the two paths. In v1 only the attested
        // path deducted the balance.
        var account = payment.FromAccount
            ?? throw new AccountNotFoundException(payment.FromAccountId);

        paymentService.CompletePaymentOrThrow(payment, account);

        approvalRepository.AddAuditEntry(Audit.Entry(
            payment.TenantId,
            userId,
            AuditActions.ApprovePayment,
            AuditEntityTypes.Payment,
            payment.Id,
            $"Betalning #{payment.Id} godkänd och genomförd: {Money.Display(payment.Amount)} " +
            $"{payment.Currency} till {payment.ToIban}." +
            (comment is null ? string.Empty : $" Kommentar: {comment}")));

        notificationService.PaymentCompleted(payment);
    }

    private void Reject(ApprovalStep step, Payment payment, List<ApprovalStep> steps, int userId, string decidedByName, string? comment)
    {
        var decidedAt = DateTime.UtcNow;

        step.Status = ApprovalStatuses.Rejected;
        step.DecidedAt = decidedAt;
        step.Comment = comment;

        payment.Status = PaymentStatuses.Rejected;

        // One rejection stops the payment, so no other attestant should be left
        // with a step they can still act on.
        foreach (var remaining in steps.Where(s => s.Status == ApprovalStatuses.Pending))
        {
            remaining.Status = ApprovalStatuses.Rejected;
            remaining.DecidedAt = decidedAt;
        }

        approvalRepository.AddAuditEntry(Audit.Entry(
            payment.TenantId,
            userId,
            AuditActions.RejectPayment,
            AuditEntityTypes.Payment,
            payment.Id,
            $"Betalning #{payment.Id} avvisad: {Money.Display(payment.Amount)} {payment.Currency}." +
            (comment is null ? string.Empty : $" Kommentar: {comment}")));

        notificationService.PaymentRejected(payment, decidedByName, comment);
    }

    private static string NormalizeAction(string? action)
    {
        var normalized = action?.Trim().ToLowerInvariant();

        return normalized is ApproveAction or RejectAction
            ? normalized
            : throw new InvalidApprovalActionException(action);
    }

    private static string? NormalizeComment(string? comment)
    {
        if (string.IsNullOrWhiteSpace(comment))
        {
            return null;
        }

        var trimmed = comment.Trim();

        if (trimmed.Length > MaxCommentLength)
        {
            throw new ApprovalCommentTooLongException(trimmed.Length, MaxCommentLength);
        }

        return trimmed;
    }

    private static bool IsAdmin(string? role) =>
        string.Equals(role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase);

    private PendingApprovalDto ToPendingApprovalDto(ApprovalStep step)
    {
        var payment = step.Payment!;
        var requiredSteps = paymentService.RequiredApprovalSteps(payment.Amount);

        return new PendingApprovalDto
        {
            PaymentId = payment.Id,
            ApprovalStepId = step.Id,
            ToIban = payment.ToIban,
            Amount = Money.Format(payment.Amount),
            Currency = payment.Currency,
            Reference = payment.Reference ?? "",
            CreatedAt = payment.CreatedAt,
            CreatedByName = payment.CreatedBy?.Name ?? "Okänd",
            FromAccountName = payment.FromAccount?.AccountName ?? "Okänt konto",
            CurrentStep = step.StepNumber,
            TotalSteps = Math.Max(payment.ApprovalSteps.Count, requiredSteps),
            RequiresDoubleApproval = paymentService.RequiresDoubleApproval(payment.Amount)
        };
    }

    private static HandledApprovalDto ToHandledApprovalDto(ApprovalStep step) => new()
    {
        PaymentId = step.PaymentId,
        ApprovalStepId = step.Id,
        StepNumber = step.StepNumber,
        Amount = Money.Format(step.Payment?.Amount ?? 0m),
        Currency = step.Payment?.Currency ?? "SEK",
        Reference = step.Payment?.Reference ?? "",
        ToIban = step.Payment?.ToIban ?? "",
        Status = step.Status,
        DecidedAt = step.DecidedAt,
        Comment = step.Comment ?? ""
    };
}
