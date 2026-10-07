using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Services;
using SebPortal.Api.Auth;

namespace SebPortal.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class DashboardController(DashboardService dashboardService) : ControllerBase
{

    [HttpGet]
    public async Task<IActionResult> Get()
    {

        var userId = User.GetUserId();
        var tenantId = User.GetTenantId();

        if (userId is null || tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        var dashboard = await dashboardService.GetDashboardAsync(tenantId.Value, userId.Value);

        if (dashboard is null)
        {
            return Unauthorized(new { message = "Åtkomst nekad. Logga in igen." });
        }

        return Ok(dashboard);
    }
}