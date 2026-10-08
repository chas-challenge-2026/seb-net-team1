namespace SebPortal.Api.DTOs;

public class BatchPaymentsResponseDto
{
    public int Total { get; set; }
    public int Completed { get; set; }
    public int PendingApproval { get; set; }
    public List<PaymentResponseDto> Payments { get; set; } = [];
}
