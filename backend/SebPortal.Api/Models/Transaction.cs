namespace SebPortal.Api.Models;

public class Transaction
{
    public int Id { get; set; }
    public decimal Amount { get; set; }
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public string? Description { get; set; }
    public string? TransactionType { get; set; }
    public int AccountId { get; set; }

    /// <summary>The payment that caused this transaction, null for deposits.</summary>
    public int? PaymentId { get; set; }

    public Account? Account { get; set; }
    public Payment? Payment { get; set; }
}

public static class TransactionTypes
{
    public const string Payment = "payment";
    public const string Deposit = "deposit";
}
