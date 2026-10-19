namespace SebPortal.Api.DTOs;

public class PaymentDetailsDto : PaymentListItemDto
{
    public string? RecipientName { get; set; }
    public List<ApprovalTimelineStepDto> ApprovalTimeline { get; set; } = [];
    public List<AuditEntryDto> Activity { get; set; } = [];
}
