namespace SebPortal.Api.Models;

/// <summary>Distinguishes a user's decision from steps closed by another step's rejection.</summary>
public static class ApprovalDecisionSources
{
    public const string Manual = "manual";
    public const string PaymentRejected = "payment_rejected";
}
