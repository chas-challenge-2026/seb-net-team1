namespace SebPortal.Api.DTOs;

public class CreatePaymentRequestDto
{
    public int FromAccountId { get; set; }
    public string ToIban { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? Reference { get; set; }
}