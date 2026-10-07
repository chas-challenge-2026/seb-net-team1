namespace SebPortal.Api.Models;

public class AuditEntry
{
    public int Id { get; set; }

    /// <summary>
    /// Set directly from the JWT or the entity being acted on, never derived by
    /// joining through User, since UserId can be null for system-generated entries.
    /// </summary>
    public int TenantId { get; set; }

    public int? UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string? EntityType { get; set; }
    public int? EntityId { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// HMAC-SHA256 of this entry's signed text (see AuditSigningFormat), base64.
    /// Proves the row hasn't been edited since it was written, provided the signing
    /// key hasn't leaked.
    /// </summary>
    public string Signature { get; set; } = string.Empty;

    /// <summary>
    /// The previous entry's Signature for this tenant, or "GENESIS" for the first
    /// entry. Chains entries together so a deleted row leaves a detectable gap,
    /// a single row's own signature alone can't reveal a deletion.
    /// </summary>
    public string PreviousSignature { get; set; } = string.Empty;

    public User? User { get; set; }
}