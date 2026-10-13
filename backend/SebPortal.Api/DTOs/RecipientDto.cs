namespace SebPortal.Api.DTOs;

public class RecipientDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Iban { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
