namespace SebPortal.Api.DTOs;

/// <summary>
/// Request body for POST /api/approvals/{approvalStepId}/decision.
/// </summary>
public class ApprovalDecisionRequestDto
{
    /// <summary>"approve" or "reject". Anything else is rejected with 400.</summary>
    public string? Action { get; set; }

    /// <summary>Optional free text comment, max 255 characters.</summary>
    public string? Comment { get; set; }
}
