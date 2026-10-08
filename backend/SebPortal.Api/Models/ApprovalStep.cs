namespace SebPortal.Api.Models;

public class ApprovalStep
{
    public int Id { get; set; }

    public Guid PublicId { get; set; } = Guid.NewGuid();

    public int PaymentId { get; set; }
    public int? AttestantId { get; set; }
    public int StepNumber { get; set; } = 1;
    public string Status { get; set; } = "pending";

    /// <summary>The authenticated user who made a direct decision, including admin decisions.</summary>
    public int? DecidedById { get; set; }

    /// <summary>Null for older steps whose decision provenance was not recorded.</summary>
    public string? DecisionSource { get; set; }

    public DateTime? DecidedAt { get; set; }
    public string? Comment { get; set; }

    public Payment? Payment { get; set; }
    public User? Attestant { get; set; }
    public User? DecidedBy { get; set; }
}
