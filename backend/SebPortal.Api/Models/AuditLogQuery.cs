namespace SebPortal.Api.Models;

public sealed class AuditLogQuery
{
    public string? Search { get; init; }
    public string? Action { get; init; }
    public int? UserId { get; init; }
    public DateTimeOffset? From { get; init; }
    public DateTimeOffset? To { get; init; }
}
