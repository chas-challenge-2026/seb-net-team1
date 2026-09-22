using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ApprovalController(ApprovalService approvalService)
    : ControllerBase
{
    [HttpGet("pending")]
    public async Task<IActionResult> GetPendingApprovals()
    {
        var userContext = GetCurrentUserContext();

        if (userContext is null)
        {
            return Unauthorized(new
            {
                message = "Du måste vara inloggad."
            });
        }

        try
        {
            var approvals =
                await approvalService.GetPendingApprovalsAsync(
                    userContext.Value.UserId,
                    userContext.Value.TenantId);

            return Ok(approvals);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpPost("{approvalStepId}/decide")]
    public async Task<IActionResult> DecideApproval(
        int approvalStepId,
        [FromBody] ApprovalDecisionDto request)
    {
        var userContext = GetCurrentUserContext();

        if (userContext is null)
        {
            return Unauthorized(new
            {
                message = "Du måste vara inloggad."
            });
        }

        try
        {
            var success =
                await approvalService.DecideApprovalAsync(
                    approvalStepId,
                    userContext.Value.UserId,
                    userContext.Value.TenantId,
                    request.Action,
                    request.Comment);

            if (!success)
            {
                return BadRequest(new
                {
                    message = "Atteststeget kunde inte hanteras."
                });
            }

            return Ok(new
            {
                message = request.Action == "approve"
                    ? "Betalningen godkändes."
                    : "Betalningen avvisades."
            });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    private (int UserId, int TenantId)? GetCurrentUserContext()
    {
        var userIdClaim =
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("userId")?.Value;

        var tenantIdClaim =
            User.FindFirst("tenantId")?.Value;

        if (!int.TryParse(userIdClaim, out var userId) ||
            !int.TryParse(tenantIdClaim, out var tenantId))
        {
            return null;
        }

        return (userId, tenantId);
    }
}