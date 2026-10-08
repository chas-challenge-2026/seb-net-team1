namespace SebPortal.Api.Options;

/// <summary>
/// Contains configurable business rules for payments.
/// </summary>
public class PaymentRulesOptions
{
    public const string SectionName = "PaymentRules";

    /// <summary>
    /// Payments above this amount must be approved by an attestant instead of
    /// being completed directly.
    /// </summary>
    public decimal ApprovalThreshold { get; set; }

    /// <summary>
    /// Payments strictly above this amount require two different decision makers.
    ///
    /// Single source of truth for the double approval rule (fixes BUG-006). v1 kept
    /// this number in two places with two different values: NewPayment.cs created a
    /// second step above 500 000 while ApprovalInbox.cs expected one above 200 000,
    /// so a 300 000 SEK payment could never reach "completed". Payment creation,
    /// approval and the frontend badge all read this one value.
    /// </summary>
    public decimal DoubleApprovalThreshold { get; set; } = 100000m;
}
