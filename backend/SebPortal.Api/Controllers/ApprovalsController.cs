using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

/// <summary>
/// The approval inbox API (US-25), replacing v1's Pages/ApprovalInbox.cshtml.cs.
/// The controller only reads the caller's identity from the JWT and delegates to
/// ApprovalService. Errors are thrown as custom exceptions and turned into
/// ProblemDetails by AppExceptionHandler. See contracts/approvals-contract.md.
/// </summary>
[ApiController]
[Authorize(Roles = UserRoles.ApproverRoles)]
[Route("api/[controller]")]
public class ApprovalsController(ApprovalService approvalService) : ControllerBase
{
    /// <summary>
    /// Returns the logged in attestant's pending approvals and the ones they have
    /// recently handled. Used by the Attestkorg page.
    /// </summary>
    /// <returns>
    /// 200 OK with the inbox, 401 Unauthorized when the token is missing required
    /// user information, 403 Forbidden when the role may not attest.
    /// </returns>
    [HttpGet]
    public async Task<IActionResult> GetInbox()
    {
        var userId = User.GetUserId();
        var tenantId = User.GetTenantId();

        if (userId is null || tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        var inbox = await approvalService.GetInboxAsync(
            tenantId.Value,
            userId.Value,
            User.GetRole());

        return Ok(inbox);
    }

    /// <summary>
    /// Approves or rejects one approval step.
    /// </summary>
    /// <param name="approvalStepId">The approval step to decide.</param>
    /// <param name="request">The action ("approve" or "reject") and an optional comment.</param>
    /// <returns>
    /// 200 OK with the resulting step and payment status, 400 for an invalid action
    /// or a too long comment, 403 when the step belongs to another attestant,
    /// 404 when it does not exist, 409 when it is already decided.
    /// </returns>
    [HttpPost("{approvalStepId:int}/decision")]
    public async Task<IActionResult> Decide(int approvalStepId, ApprovalDecisionRequestDto request)
    {
        var userId = User.GetUserId();
        var tenantId = User.GetTenantId();

        if (userId is null || tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        var decision = await approvalService.DecideAsync(
            approvalStepId,
            request,
            tenantId.Value,
            userId.Value,
            User.GetRole());

        return Ok(decision);
    }
}
