namespace SebPortal.Api.DTOs;

public sealed class AuditLogFiltersDto
{
    public List<string> Actions { get; set; } = [];
    public List<AuditLogUserFilterDto> Users { get; set; } = [];
}

public sealed class AuditLogUserFilterDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
}
