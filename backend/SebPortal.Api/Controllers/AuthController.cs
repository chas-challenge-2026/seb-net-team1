using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

/// <summary>
/// Login, silent refresh and logout. The access token (JWT, 15 min) is returned in
/// the body and kept in memory by the frontend; the refresh token is an httpOnly,
/// Secure, SameSite=Strict cookie limited to /api/auth, so scripts can never read it.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class AuthController(AuthService authService) : ControllerBase
{
    public const string RefreshCookieName = "seb_refresh";
    private const string RefreshCookiePath = "/api/auth";

    [HttpPost("login")]
    [EnableRateLimiting(RateLimitPolicies.Login)]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Problem(statusCode: StatusCodes.Status400BadRequest, title: "BadRequest",
                detail: "E-post och lösenord måste anges.");
        }

        var session = await authService.LoginAsync(request.Email, request.Password, ClientIp());
        SetRefreshCookie(session);
        return Ok(session.Response);
    }

    [HttpPost("refresh")]
    [EnableRateLimiting(RateLimitPolicies.Refresh)]
    public async Task<ActionResult<LoginResponse>> Refresh()
    {
        try
        {
            var session = await authService.RefreshAsync(Request.Cookies[RefreshCookieName], ClientIp());
            SetRefreshCookie(session);
            return Ok(session.Response);
        }
        catch (Exceptions.InvalidRefreshTokenException)
        {
            DeleteRefreshCookie();
            throw;
        }
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await authService.LogoutAsync(Request.Cookies[RefreshCookieName]);
        DeleteRefreshCookie();
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<ActionResult<AuthenticatedUserDto>> Me()
    {
        if (User.GetUserId() is not { } userId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await authService.GetCurrentUserAsync(userId, tenantId));
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        if (User.GetUserId() is not { } userId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        await authService.ChangePasswordAsync(userId, tenantId, request.CurrentPassword, request.NewPassword);
        return NoContent();
    }

    private void SetRefreshCookie(AuthSession session) =>
        Response.Cookies.Append(RefreshCookieName, session.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            // Browsers treat http://localhost as a secure context, so this also works locally.
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = RefreshCookiePath,
            Expires = session.RefreshTokenExpiresAt,
            IsEssential = true
        });

    private void DeleteRefreshCookie() =>
        Response.Cookies.Delete(RefreshCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = true,
            SameSite = SameSiteMode.Strict,
            Path = RefreshCookiePath
        });

    private string? ClientIp() => HttpContext.Connection.RemoteIpAddress?.ToString();
}
