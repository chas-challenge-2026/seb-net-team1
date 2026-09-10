public class Account
{
    public int Id { get; set; }
    public string AccountNumber { get; set; }
    public decimal Balance { get; set; }
    public string? AccountType { get; set; }
    public int CustomerId { get; set; }
    public int IBAN { get; set; }
    public ICollection<Transaction> Transactions { get; set; }
        = new List<Transaction>();
}