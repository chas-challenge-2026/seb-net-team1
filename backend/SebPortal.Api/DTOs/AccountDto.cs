namespace SebPortal.Api.DTOs;

public class AccountDto
{
    public int Id { get; set; }
    public string? AccountName { get; set; }
    public string? Iban { get; set; }
    public string? Balance { get; set; } 
    public string? Currency { get; set; }
}
