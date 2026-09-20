namespace SebPortal.Api.DTOs;

/// <summary>
/// Response body for POST /api/approvals/{approvalStepId}/decision.
/// </summary>
public class ApprovalDecisionResponseDto
{
    public int PaymentId { get; set; }
    public int ApprovalStepId { get; set; }

    /// <summary>"approved" or "rejected".</summary>
    public string StepStatus { get; set; } = string.Empty;

    /// <summary>
    /// The payment's resulting status: "completed", "pending_approval" when more
    /// steps remain, or "rejected".
    /// </summary>
    public string PaymentStatus { get; set; } = string.Empty;
}
