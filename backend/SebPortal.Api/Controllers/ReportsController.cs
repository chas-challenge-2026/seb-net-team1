using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/reports")]
public class ReportsController(ReportService reportService) : ControllerBase
{
    [HttpGet("payments")]
    public async Task<IActionResult> GetPayments(
        [FromQuery] string? from,
        [FromQuery] string? to,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var tenantId = User.GetTenantId();
        if (userId is null || tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        var report = await reportService.GetPaymentsAsync(
            tenantId.Value, userId.Value, from, to, cancellationToken);

        return report is null
            ? Unauthorized(new { message = "Åtkomst nekad. Logga in igen." })
            : Ok(report);
    }
}
