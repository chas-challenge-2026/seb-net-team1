namespace SebPortal.Api.Exceptions;

public class ApprovalStepNotFoundException(Guid approvalStepId)
    : NotFoundException(
        userMessage: "Atteststeget hittades inte.",
        technicalMessage: $"ApprovalStep with id {approvalStepId} was not found.");

public class ApprovalStepAlreadyDecidedException(Guid approvalStepId, string currentStatus)
    : ConflictException(
        userMessage: "Det här atteststeget är redan hanterat.",
        technicalMessage: $"ApprovalStep {approvalStepId} has status '{currentStatus}', expected 'pending'.");

public class DuplicateApprovalDecisionException(int paymentId, int attemptedByUserId)
    : ConflictException(
        userMessage: "Du har redan godkänt den här betalningen. En annan attestant måste godkänna nästa steg.",
        technicalMessage: $"User {attemptedByUserId} already approved another step of Payment {paymentId}, which requires two different decision makers.");

/// <summary>
/// Fixes BUG-011 (IDOR in attestkorgen): v1 let any attestant approve any
/// step just by knowing its id. This exception is thrown when a step exists
/// but isn't assigned to the logged in user.
/// </summary>
public class ApprovalStepAccessDeniedException(Guid approvalStepId, int attemptedByUserId)
    : ForbiddenException(
        userMessage: "Du har inte behörighet till detta atteststeg.",
        technicalMessage: $"User {attemptedByUserId} attempted to decide ApprovalStep {approvalStepId}, which is not assigned to them.");

public class InvalidApprovalActionException(string? attemptedAction)
    : BadRequestException(
        userMessage: "Ogiltig åtgärd.",
        technicalMessage: $"Approval action '{attemptedAction}' is not one of 'approve' or 'reject'.");

public class ApprovalCommentTooLongException(int length, int maxLength)
    : BadRequestException(
        userMessage: $"Kommentaren får vara högst {maxLength} tecken.",
        technicalMessage: $"Approval comment length {length} exceeds the maximum of {maxLength}.");
