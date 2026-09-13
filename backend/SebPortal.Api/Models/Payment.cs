public class Payment
{
    public int Id { get; set; }
    public int FromAccountId { get; set; }
    public decimal Amount { get; set; }
    public string Status { get; set; } = PaymentStatuses.PendingApproval;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExecutedAt { get; set; }
    public string? Reference { get; set; }
}