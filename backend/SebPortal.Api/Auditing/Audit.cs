using SebPortal.Api.Models;

namespace SebPortal.Api.Auditing;

/// <summary>Creates audit entries. Chain fields are filled in when the entry is saved.</summary>
public static class Audit
{
    public static AuditEntry Entry(
        int tenantId,
        int? userId,
        string action,
        string entityType,
        int? entityId,
        string description) => new()
    {
        TenantId = tenantId,
        UserId = userId,
        Action = action,
        EntityType = entityType,
        EntityId = entityId,
        Description = description,
        CreatedAt = DateTime.UtcNow
    };
}
