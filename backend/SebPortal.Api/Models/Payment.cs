namespace SebPortal.Api.Models;

public class Payment
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int FromAccountId { get; set; }
    public string ToIban { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "SEK";
    public string? Reference { get; set; }
    public string Status { get; set; } = PaymentStatuses.PendingApproval;
    public int? CreatedById { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExecutedAt { get; set; }

    public Account? FromAccount { get; set; }
    public User? CreatedBy { get; set; }
    public Tenant? Tenant { get; set; }
    public ICollection<ApprovalStep> ApprovalSteps { get; set; } = new List<ApprovalStep>();
}