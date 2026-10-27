namespace SebPortal.Api.DTOs;

/// <summary>
/// Returned by POST /api/auth/login and POST /api/auth/refresh. The refresh token is
/// not part of the body: it is set as an httpOnly cookie so scripts cannot read it.
/// </summary>
public class LoginResponse
{
    public AuthenticatedUserDto? User { get; set; }
}
