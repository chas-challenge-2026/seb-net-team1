namespace SebPortal.Api.Models;

public class Account
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string AccountName { get; set; } = string.Empty;
    public string Iban { get; set; } = string.Empty;
    public decimal Balance { get; set; }
    public string Currency { get; set; } = "SEK";

    /// <summary>
    /// Optimistic concurrency token, mapped to PostgreSQL's xmin system column.
    /// Two requests that both read the same balance cannot both write it back:
    /// the second SaveChanges fails instead of silently overwriting the first.
    /// </summary>
    public uint Version { get; set; }

    public Tenant? Tenant { get; set; }
    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}
