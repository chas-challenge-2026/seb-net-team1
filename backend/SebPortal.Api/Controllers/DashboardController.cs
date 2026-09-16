using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Services;
using System.IdentityModel.Tokens.Jwt;

namespace SebPortal.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class DashboardController(DashboardService dashboardService) : ControllerBase
{

    [HttpGet]
    public async Task<IActionResult> Get()
    {

        var userIdClaim = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        var tenantIdClaim = User.FindFirst("tenantId")?.Value;

        if (!int.TryParse(userIdClaim, out var userId) ||
            !int.TryParse(tenantIdClaim, out var tenantId))
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        var dashboard = await dashboardService.GetDashboardAsync(tenantId, userId);

        if (dashboard is null)
        {
            return Unauthorized(new { message = "Åtkomst nekad. Logga in igen." });
        }

        return Ok(dashboard);
    }
}