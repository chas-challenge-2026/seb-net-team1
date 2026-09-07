namespace SebPortal.Api.DTOs;

public class LoginResponse // Backend skicka tillbaka en Response till fronend vid lyckad inlogg
{
    public string? AccessToken { get; set; }
    public AuthenticatedUserDto? User { get; set; }
}