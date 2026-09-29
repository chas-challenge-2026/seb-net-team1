namespace SebPortal.Api.Models;

/// <summary>
/// One row in the tamper evident audit log. The database is the only audit
/// destination (v1 wrote some events to a file and some to the database, BUG-008).
///
/// Every entry is chained to the previous entry of the same tenant: Hash is an
/// HMAC-SHA256 over the entry's content plus PreviousHash, computed when the entry
/// is saved (see Auditing/AuditChainInterceptor). Changing, deleting or reordering
/// a row breaks the chain, which GET /api/audit-log/verify reports.
/// </summary>
public class AuditEntry
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int? UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string? EntityType { get; set; }
    public int? EntityId { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>1-based position in the tenant's chain.</summary>
    public long ChainIndex { get; set; }

    /// <summary>Hash of the previous entry in the chain, 64 zeros for the first entry.</summary>
    public string PreviousHash { get; set; } = string.Empty;

    public string Hash { get; set; } = string.Empty;

    public User? User { get; set; }
}
