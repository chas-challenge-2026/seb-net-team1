namespace SebPortal.Api.Models;

public class ApprovalStep
{
    public int Id { get; set; }
    public int PaymentId { get; set; }
    public int? AttestantId { get; set; }
    public int StepNumber { get; set; } = 1;
    public string Status { get; set; } = "pending";
    public DateTime? DecidedAt { get; set; }
    public string? Comment { get; set; }

    public Payment? Payment { get; set; }
    public User? Attestant { get; set; }
}
