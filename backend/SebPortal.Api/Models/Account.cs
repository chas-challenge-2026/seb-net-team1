public class Account
{
    public int Id { get; set; }
    public string? AccountNumber { get; set; }
    public decimal Balance { get; set; }
    public string? AccountType { get; set; }
    public int CustomerId { get; set; } // TenantId
    public int ISBN { get; set; } // IBAN
    public ICollection<Transaction> Transactions { get; set; }
        = new List<Transaction>();
}
