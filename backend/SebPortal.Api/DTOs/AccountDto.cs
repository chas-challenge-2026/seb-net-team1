namespace SebPortal.Api.DTOs;

public class AccountDto
{
    public int Id { get; set; }
    public string? AccountName { get; set; }
    public string? Iban { get; set; }
    public string? Balance { get; set; } 
    public string? Currency { get; set; }
    public List<AccountBalancePointDto> BalanceHistory { get; set; } = [];
}

public class AccountBalancePointDto
{
    public string Month { get; set; } = string.Empty;
    public string Balance { get; set; } = "0.00";
}
