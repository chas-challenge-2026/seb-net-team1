namespace SebPortal.Api.Models;

public static class PaymentStatuses
{
    public const string PendingApproval = "pending_approval";
    public const string Completed = "completed";
    public const string Rejected = "rejected";

    public static readonly IReadOnlyList<string> All = [PendingApproval, Completed, Rejected];
}

public static class PaymentSources
{
    public const string Manual = "manual";
    public const string Batch = "batch";
}
