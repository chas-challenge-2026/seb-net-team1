namespace SebPortal.Api.DTOs;

/// <summary>
/// An approval step the logged in attestant has already decided.
/// </summary>
public class HandledApprovalDto
{
    public int PaymentId { get; set; }
    public int ApprovalStepId { get; set; }
    public int StepNumber { get; set; }

    /// <summary>Decimal string, never a floating point number.</summary>
    public string Amount { get; set; } = string.Empty;

    public string Currency { get; set; } = "SEK";
    public string Reference { get; set; } = string.Empty;
    public string ToIban { get; set; } = string.Empty;

    /// <summary>"approved" or "rejected".</summary>
    public string Status { get; set; } = string.Empty;

    public DateTime? DecidedAt { get; set; }
    public string Comment { get; set; } = string.Empty;
}
