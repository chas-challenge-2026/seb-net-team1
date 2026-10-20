using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.Models;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

// The audit log shows who approved or rejected what, so only roles that take part
// in approvals may read it. An initiator only creates payments (403). Same
// pattern as the approvals endpoints.
[ApiController]
[Authorize(Roles = UserRoles.ApproverRoles)]
[Route("api/audit-log")]
public class AuditLogController(AuditService auditService) : ControllerBase
{
    private const int DefaultLimit = 50;
    private const int MaxLimit = 200;

    [HttpGet]
    public async Task<IActionResult> GetAuditLog(
        [FromQuery] int? limit,
        [FromQuery] string? cursor,
        [FromQuery] string? search = null,
        [FromQuery] string? action = null,
        [FromQuery] int? userId = null,
        [FromQuery] DateTimeOffset? from = null,
        [FromQuery] DateTimeOffset? to = null)
    {
        var tenantId = User.GetTenantId();

        if (tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        search = search?.Trim();
        if (search?.Length > 200)
        {
            return BadRequest(new { message = "Sökningen får innehålla högst 200 tecken." });
        }

        if ((action is not null || Request.Query.ContainsKey(nameof(action))) &&
            (string.IsNullOrWhiteSpace(action) || action.Length > 100))
        {
            return BadRequest(new { message = "Ogiltig händelsekod." });
        }

        if (userId < 0)
        {
            return BadRequest(new { message = "Användar-ID måste vara positivt, eller 0 för systemhändelser." });
        }

        if (from.HasValue && to.HasValue && from.Value >= to.Value)
        {
            return BadRequest(new { message = "Startdatum måste vara före slutdatum." });
        }

        var effectiveLimit = limit is > 0 and <= MaxLimit ? limit.Value : DefaultLimit;

        var response = await auditService.GetAuditLogAsync(tenantId.Value, effectiveLimit, cursor,
            new AuditLogQuery { Search = search, Action = action, UserId = userId, From = from, To = to });

        return Ok(response);
    }

    [HttpGet("filters")]
    public async Task<IActionResult> GetFilters()
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        return Ok(await auditService.GetFiltersAsync(tenantId.Value));
    }
}
