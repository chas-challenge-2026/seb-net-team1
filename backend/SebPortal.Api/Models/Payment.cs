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

    /// <summary>"manual" or "batch", see <see cref="PaymentSources"/>.</summary>
    public string Source { get; set; } = PaymentSources.Manual;

    /// <summary>
    /// Client supplied Idempotency-Key. A retried request with the same key returns
    /// the payment that was already created instead of creating a duplicate.
    /// </summary>
    public string? IdempotencyKey { get; set; }

    /// <summary>Optimistic concurrency token (xmin), see <see cref="Account.Version"/>.</summary>
    public uint Version { get; set; }

    public Account? FromAccount { get; set; }
    public User? CreatedBy { get; set; }
    public Tenant? Tenant { get; set; }
    public ICollection<ApprovalStep> ApprovalSteps { get; set; } = new List<ApprovalStep>();
}
