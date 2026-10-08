namespace SebPortal.Api.DTOs;

public class AuditLogResponseDto
{
    public List<AuditEntryDto> Entries { get; set; } = [];
    public string? NextCursor { get; set; }
}