namespace SebPortal.Api.DTOs;

public class PaymentSummaryDto
{
    public int Id { get; set; }
    public string? ToIban { get; set; }
    public string? Amount { get; set; } 
    public string? Currency { get; set; }
    public string? Reference { get; set; }
    public string? Status { get; set; } // will be completed, pending_approval, rejected 
    public DateTime CreatedAt { get; set; }
}