namespace SebPortal.Api.DTOs;

public class AccountDto
{
    public int Id { get; set; }
    public string? AccountName { get; set; }
    public string? Iban { get; set; }
    public string? Balance { get; set; }

    /// <summary>Balance minus the money reserved by payments waiting for attest.</summary>
    public string? AvailableBalance { get; set; }

    /// <summary>Sum of this account's payments waiting for attest.</summary>
    public string? ReservedAmount { get; set; }

    public string? Currency { get; set; }
    public int PendingPaymentCount { get; set; }
}

public class TransactionDto
{
    public int Id { get; set; }
    public DateTime Date { get; set; }

    /// <summary>Negative for money leaving the account.</summary>
    public string Amount { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
    public string TransactionType { get; set; } = string.Empty;
    public int? PaymentId { get; set; }
}

public class PagedResponse<T>
{
    public List<T> Items { get; set; } = [];
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}
