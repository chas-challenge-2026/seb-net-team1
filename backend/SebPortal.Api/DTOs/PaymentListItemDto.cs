namespace SebPortal.Api.DTOs;

public class PaymentListItemDto
{
    public int Id { get; set; }
    public int FromAccountId { get; set; }
    public string? FromAccountName { get; set; }
    public string? CreatedByName { get; set; }
    public string ToIban { get; set; } = string.Empty;
    public string Amount { get; set; } = "0.00";
    public string Currency { get; set; } = "SEK";
    public string? Reference { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? ExecutedAt { get; set; }
}
