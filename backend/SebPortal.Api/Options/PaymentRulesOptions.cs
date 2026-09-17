namespace SebPortal.Api.Options;

/// <summary>
/// Contains configurable business rules for payments.
/// </summary>
public class PaymentRulesOptions
{
    public const string SectionName = "PaymentRules";

    public decimal ApprovalThreshold { get; set; }
}
