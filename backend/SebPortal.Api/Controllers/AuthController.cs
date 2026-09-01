using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(AuthService authService) : ControllerBase
{
    [HttpPost("login")]
    public IActionResult Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "E-post och lösenord måste anges." });
        }

        var response = authService.Login(request);

        if (response is null)
        {
            return Unauthorized(new { message = "Fel e-post eller lösenord" });
        }
        return Ok(response);

    }
}