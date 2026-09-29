namespace SebPortal.Api.Models;

public class ApprovalStep
{
    public int Id { get; set; }
    public int PaymentId { get; set; }
    public int? AttestantId { get; set; }
    public int StepNumber { get; set; } = 1;
    public string Status { get; set; } = ApprovalStatuses.Pending;
    public DateTime? DecidedAt { get; set; }
    public string? Comment { get; set; }

    /// <summary>
    /// Optimistic concurrency token (xmin). Two attestants deciding the same step at
    /// the same moment cannot both succeed: the second save fails with a conflict.
    /// </summary>
    public uint Version { get; set; }

    public Payment? Payment { get; set; }
    public User? Attestant { get; set; }
}
