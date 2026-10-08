using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

// TODO: [Authorize] here means any logged-in user in the tenant can read the
// audit log, matching the contract as currently written. Not yet decided whether
// this should be restricted to attestant/admin, since the log shows who approved
// or rejected what. Restrict with [Authorize(Roles = UserRoles.ApproverRoles)]
// once that's settled, same pattern as the approvals endpoints.
[ApiController]
[Authorize]
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