namespace SebPortal.Api.Models;

public class Transaction
{
    public int Id { get; set; }
    public decimal Amount { get; set; }
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public string? Description { get; set; }
    public string? TransactionType { get; set; }
    public int AccountId { get; set; }

    public Account? Account { get; set; }
}