namespace SebPortal.Api.Models;

/// <summary>
/// A long lived, single use refresh token. Only the SHA-256 hash is stored; the
/// token itself lives in an httpOnly cookie in the browser.
///
/// Rotation: every refresh revokes the presented token and issues a new one in the
/// same family. Presenting an already revoked token means it was stolen and replayed,
/// so the whole family is revoked and the user has to log in again.
/// </summary>
public class RefreshToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public Guid FamilyId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? ReplacedByTokenHash { get; set; }
    public string? CreatedByIp { get; set; }

    public User? User { get; set; }

    public bool IsActive(DateTime now) => RevokedAt is null && ExpiresAt > now;
}
