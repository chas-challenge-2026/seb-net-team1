namespace SebPortal.Api.DTOs;

/// <summary>
/// Response body for GET /api/audit-log. See contracts/audit-log-contract.md.
/// </summary>
public class AuditLogResponse
{
    public List<AuditLogEntryDto> Entries { get; set; } = [];

    /// <summary>Pass as "cursor" to fetch older entries. Null when there are no more.</summary>
    public string? NextCursor { get; set; }
}

public class AuditLogEntryDto
{
    public int Id { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public int? EntityId { get; set; }
    public string Description { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public string UserName { get; set; } = string.Empty;
}
