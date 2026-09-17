namespace SebPortal.Api.Exceptions;

public class ApprovalStepNotFoundException(int approvalStepId)
    : NotFoundException(
        userMessage: "Atteststeget hittades inte.",
        technicalMessage: $"ApprovalStep with id {approvalStepId} was not found.");

public class ApprovalStepAlreadyDecidedException(int approvalStepId, string currentStatus)
    : ConflictException(
        userMessage: "Det här atteststeget är redan hanterat.",
        technicalMessage: $"ApprovalStep {approvalStepId} has status '{currentStatus}', expected 'pending'.");

/// <summary>
/// Fixes BUG-011 (IDOR in attestkorgen): v1 let any attestant approve any
/// step just by knowing its id. This exception is thrown when a step exists
/// but isn't assigned to the logged in user.
/// </summary>
public class ApprovalStepAccessDeniedException(int approvalStepId, int attemptedByUserId)
    : ForbiddenException(
        userMessage: "Du har inte behörighet till detta atteststeg.",
        technicalMessage: $"User {attemptedByUserId} attempted to decide ApprovalStep {approvalStepId}, which is not assigned to them.");
