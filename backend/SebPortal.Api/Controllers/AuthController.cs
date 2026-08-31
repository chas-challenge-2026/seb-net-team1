using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;

    public AuthController(AuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    public IActionResult Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "E-post och lösenord måste anges." });
        }

        var response = _authService.Login(request);

        if (response is null)
        {
            return Unauthorized(new { message = "Fel e-post eller lösenord" });
        }
        return Ok(response);

    }
}