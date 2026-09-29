namespace SebPortal.Api.Models;

public class User
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    /// <summary>BCrypt hash. v1 stored unsalted MD5 here (BUG-002).</summary>
    public string? PasswordHash { get; set; }

    public string Role { get; set; } = string.Empty;

    /// <summary>Deactivated users cannot log in or refresh their session.</summary>
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Tenant? Tenant { get; set; }
}
