using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[RequireCsrf]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class AuthController(
    AuthService authService,
    JwtTokenService jwtTokenService,
    IAntiforgery antiforgery,
    IConfiguration configuration) : ControllerBase
{
    [HttpGet("csrf")]
    public IActionResult Csrf()
    {
        var tokens = antiforgery.GetAndStoreTokens(HttpContext);
        return Ok(new { requestToken = tokens.RequestToken });
    }

    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public IActionResult Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "E-post och lösenord måste anges." });
        }

        var user = authService.Login(request);

        if (user is null)
        {
            return Unauthorized(new { message = "Fel e-post eller lösenord" });
        }
        var token = jwtTokenService.GenerateToken(user.Id, user.TenantId, user.Email!, user.Role!, user.Name!);
        var cookieOptions = AuthCookie.CreateOptions(Request, configuration);
        // Match the JWT's actual expiry, so the browser cannot extend the session.
        cookieOptions.Expires = new JwtSecurityTokenHandler().ReadJwtToken(token).ValidTo;
        Response.Cookies.Append(AuthCookie.Name, token, cookieOptions);
        return Ok(new LoginResponse { User = user });
    }

    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(AuthCookie.Name, AuthCookie.CreateOptions(Request, configuration));
        return NoContent();
    }
}
