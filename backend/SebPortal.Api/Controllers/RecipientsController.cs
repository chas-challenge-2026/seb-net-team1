using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/recipients")]
public class RecipientsController(RecipientService recipientService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null || User.GetUserId() is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        return Ok(await recipientService.GetRecipientsAsync(tenantId.Value));
    }

    [HttpPost]
    [Authorize(Roles = UserRoles.CreatorRoles)]
    public async Task<IActionResult> Create(CreateRecipientRequestDto request)
    {
        var userId = User.GetUserId();
        var tenantId = User.GetTenantId();
        if (userId is null || tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        var recipient = await recipientService.CreateRecipientAsync(
            tenantId.Value, userId.Value, request.Name, request.Iban, request.DemoConfirmed);
        return Created($"/api/recipients/{recipient.Id}", recipient);
    }
}
