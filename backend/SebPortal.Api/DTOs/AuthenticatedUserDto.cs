namespace SebPortal.Api.DTOs;

public class AuthenticatedUserDto // den användarinformation frontend får tillbaka efter lyckad inloggning
{
    public int Id { get; set; }
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Role { get; set; }
    public int TenantId { get; set; }
}