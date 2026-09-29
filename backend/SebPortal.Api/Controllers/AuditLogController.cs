using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

/// <summary>
/// Read side of the audit log. See contracts/audit-log-contract.md.
/// </summary>
[ApiController]
[Authorize]
[Route("api/audit-log")]
public class AuditLogController(AuditLogService auditLogService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AuditLogResponse>> Get(
        [FromQuery] int? limit,
        [FromQuery] string? cursor,
        [FromQuery] string? action,
        [FromQuery] string? entityType,
        [FromQuery] int? entityId)
    {
        var tenantId = User.GetTenantId();

        if (tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        return Ok(await auditLogService.GetAuditLogAsync(
            tenantId.Value, limit, cursor, new AuditLogFilter(action, entityType, entityId)));
    }

    /// <summary>Recomputes the tenant's HMAC chain and reports the first tampered entry, if any.</summary>
    [HttpGet("verify")]
    [Authorize(Roles = UserRoles.Admin)]
    public async Task<ActionResult<AuditChainVerificationResponse>> Verify(CancellationToken cancellationToken)
    {
        if (User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        var status = await auditLogService.VerifyChainAsync(tenantId, cancellationToken);

        return Ok(new AuditChainVerificationResponse
        {
            Valid = status.Valid,
            CheckedCount = status.CheckedCount,
            FirstInvalidEntryId = status.FirstInvalidEntryId,
            VerifiedAt = DateTime.UtcNow
        });
    }
}
