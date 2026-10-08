namespace SebPortal.Api.DTOs;

/// <summary>
/// A handled approval step assigned to or directly decided by the logged in user.
/// </summary>
public class HandledApprovalDto
{
    public int PaymentId { get; set; }

    /// <summary>Decimal string, never a floating point number.</summary>
    public string Amount { get; set; } = string.Empty;

    /// <summary>"approved" or "rejected".</summary>
    public string Status { get; set; } = string.Empty;

    public DateTime? DecidedAt { get; set; }
    public string Comment { get; set; } = string.Empty;

    /// <summary>"payment_rejected" means this step was closed without a direct decision.</summary>
    public string? DecisionSource { get; set; }

    /// <summary>All existing steps, including steps still waiting after this user's decision.</summary>
    public List<ApprovalTimelineStepDto> Timeline { get; set; } = [];
}
