namespace SebPortal.Api.DTOs;

/// <summary>One existing approval step, with assignment and recorded decision provenance.</summary>
public class ApprovalTimelineStepDto
{
    public Guid ApprovalStepId { get; set; }
    public int StepNumber { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? AttestantName { get; set; }
    public string? DecidedByName { get; set; }
    public DateTime? DecidedAt { get; set; }
    public string? Comment { get; set; }

    /// <summary>"manual", "payment_rejected", or null when no provenance was recorded.</summary>
    public string? DecisionSource { get; set; }
}
