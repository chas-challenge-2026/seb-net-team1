using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController(DashboardService dashboardService) : ControllerBase
{
    // we will replace these with real ones from JWT claims once auth middleware is there
    private const int CurrentTenantId = 1;
    private const int CurrentUserId = 1;

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var dashboard = await dashboardService.GetDashboardAsync(CurrentTenantId, CurrentUserId);

        if (dashboard is null)
        {
            return Unauthorized(new { message = "Åtkomst nekad. Logga in igen." });
        }

        return Ok(dashboard);
    }
}