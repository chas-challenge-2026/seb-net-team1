namespace SebPortal.Api.DTOs;

/// <summary>Batch outcome when every row was valid and the payments were created.</summary>
public class BatchPaymentsResponseDto
{
    public bool Processed => true;
    public bool Parsed => true;
    public int Total { get; set; }
    public int Completed { get; set; }
    public int PendingApproval { get; set; }
    public decimal TotalAmount { get; set; }
    public List<PaymentResponseDto> Payments { get; set; } = [];
}
