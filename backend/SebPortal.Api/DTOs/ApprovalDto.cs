namespace SebPortal.Api.DTOs;

public class PendingApprovalDto
{
    public int ApprovalStepId { get; set; }
    public int PaymentId { get; set; }
    public int StepNumber { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = string.Empty;
    public string ToIban { get; set; } = string.Empty;
    public string? Reference { get; set; }
    public string PaymentStatus { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class ApprovalDecisionDto
{
    public string Action { get; set; } = string.Empty;
    public string? Comment { get; set; }
}