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
    public async Task<IActionResult> GetAuditLog([FromQuery] int? limit, [FromQuery] string? cursor)
    {
        var tenantId = User.GetTenantId();

        if (tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        var effectiveLimit = limit is > 0 and <= MaxLimit ? limit.Value : DefaultLimit;

        var response = await auditService.GetAuditLogAsync(tenantId.Value, effectiveLimit, cursor);

        return Ok(response);
    }
}