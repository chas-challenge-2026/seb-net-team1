namespace SebPortal.Api.DTOs;

public class LoginRequest // Frontend skickar in en request till backend 
{
    public string? Email { get; set; }
    public string? Password { get; set; }
}