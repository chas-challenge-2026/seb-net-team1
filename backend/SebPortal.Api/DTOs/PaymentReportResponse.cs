namespace SebPortal.Api.DTOs;

public class PaymentReportResponse
{
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string TimeZone { get; set; } = string.Empty;
    public List<PaymentReportRowDto> Payments { get; set; } = [];
}

public class PaymentReportRowDto
{
    public int Id { get; set; }
    public string Reference { get; set; } = string.Empty;
    public string ToIban { get; set; } = string.Empty;
    public string? FromAccountName { get; set; }
    public string Amount { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
