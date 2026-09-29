namespace SebPortal.Api.DTOs;

/// <summary>The logged in user, as returned by login, refresh, /api/auth/me and the dashboard.</summary>
public class AuthenticatedUserDto
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Role { get; set; }
    public int TenantId { get; set; }
    public string? TenantName { get; set; }
}
