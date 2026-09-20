namespace SebPortal.Api.DTOs;

/// <summary>
/// One payment awaiting the logged in attestant's decision.
/// </summary>
public class PendingApprovalDto
{
    public int PaymentId { get; set; }

    /// <summary>Id of this specific step. Passed back to POST /api/approvals/{id}/decision.</summary>
    public int ApprovalStepId { get; set; }

    public string ToIban { get; set; } = string.Empty;

    /// <summary>Decimal string, never a floating point number.</summary>
    public string Amount { get; set; } = string.Empty;

    public string Currency { get; set; } = "SEK";
    public string Reference { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string CreatedByName { get; set; } = string.Empty;
    public string FromAccountName { get; set; } = string.Empty;

    /// <summary>Which step this is, 1-indexed.</summary>
    public int CurrentStep { get; set; }

    /// <summary>Total approval steps required for this payment.</summary>
    public int TotalSteps { get; set; }

    /// <summary>
    /// Computed by the backend from PaymentRules:DoubleApprovalThreshold so the
    /// frontend never has to duplicate the amount rule itself.
    /// </summary>
    public bool RequiresDoubleApproval { get; set; }
}
