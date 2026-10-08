namespace SebPortal.Api.Models;

/// <summary>
/// The statuses an <see cref="ApprovalStep"/> can have. Matches the
/// approval_steps.status column and the values in approvals-contract.md.
/// </summary>
public static class ApprovalStatuses
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
}
