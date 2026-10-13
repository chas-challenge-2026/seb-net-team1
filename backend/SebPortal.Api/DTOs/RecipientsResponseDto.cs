namespace SebPortal.Api.DTOs;

public class RecipientsResponseDto
{
    public List<RecipientDto> Recipients { get; set; } = [];
    public bool DemoConfirmationEnabled { get; set; }
}
