public class Transaction
{
    public int Id { get; set; }
    public decimal Amount { get; set; }
    public DateTime Date { get; set; }
    public string? Description { get; set; }
    public string? TransactionType { get; set; }
    public int AccountId { get; set; }
    public Account? Account { get; set; }
}