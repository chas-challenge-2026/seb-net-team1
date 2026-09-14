namespace SebPortal.Api.Models;

public class Account
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string AccountName { get; set; } = string.Empty;
    public string Iban { get; set; } = string.Empty;
    public decimal Balance { get; set; }
    public string Currency { get; set; } = "SEK";

    public Tenant? Tenant { get; set; }
    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}
