namespace SebPortal.Api.DTOs;

/// <summary>
/// Returned by POST /api/auth/login and POST /api/auth/refresh. The refresh token is
/// not part of the body: it is set as an httpOnly cookie so scripts cannot read it.
/// </summary>
public class LoginResponse
{
    public string? AccessToken { get; set; }

    /// <summary>When the access token expires (UTC). The frontend refreshes before or on 401.</summary>
    public DateTime ExpiresAt { get; set; }

    public AuthenticatedUserDto? User { get; set; }
}

public class ChangePasswordRequest
{
    public string? CurrentPassword { get; set; }
    public string? NewPassword { get; set; }
}
