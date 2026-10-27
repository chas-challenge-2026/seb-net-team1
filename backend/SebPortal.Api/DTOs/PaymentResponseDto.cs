namespace SebPortal.Api.DTOs;

public class PaymentResponseDto
{
    public int Id { get; set; }
    public string Status { get; set; } = string.Empty;
    public int FromAccountId { get; set; }
    public string ToIban { get; set; } = string.Empty;
    public string Amount { get; set; } = string.Empty;
    public string Currency { get; set; } = "SEK";
    public string? Reference { get; set; }
    public DateTime CreatedAt { get; set; }
}
