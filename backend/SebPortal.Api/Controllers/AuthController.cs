using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.DTOs;

namespace SebPortal.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    [HttpPost("login")]
    public IActionResult Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { message = "E-post och lösenord måste anges." });
        }

        var response = new LoginResponse
        {
            AccessToken = "mock-jwt-token",
            User = new AuthenticatedUserDto
            {
                Id = 1,
                Name = "Lisa Andersson",
                Email = request.Email,
                Role = "initiator",
                TenantId = 1
            }
        };

        return Ok(response);
    }
}