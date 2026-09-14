namespace SebPortal.Api.Models;

public class User
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public string Role { get; set; } = string.Empty;

    public Tenant? Tenant { get; set; }
}