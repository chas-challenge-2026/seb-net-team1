namespace SebPortal.Api.DTOs;

public class CreateRecipientRequestDto
{
    public string? Name { get; set; }
    public string? Iban { get; set; }
    public bool DemoConfirmed { get; set; }
}
