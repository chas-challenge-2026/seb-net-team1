namespace SebPortal.Api.Models;

public class User // User är en intern BackendModel
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Role { get; set; }
    public int TenantId { get; set; }
    public string? PasswordHash { get; set; }
}