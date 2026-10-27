using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

/// <summary>The logged in user's in-app notifications (the bell in the top bar).</summary>
[ApiController]
[Authorize]
[Route("api/[controller]")]
public class NotificationsController(NotificationService notificationService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<NotificationListResponse>> List([FromQuery] int limit = 20)
    {
        if (User.GetUserId() is not { } userId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await notificationService.GetForUserAsync(userId, tenantId, limit));
    }

    [HttpPost("{notificationId:int}/read")]
    public async Task<IActionResult> MarkAsRead(int notificationId)
    {
        if (User.GetUserId() is not { } userId)
        {
            return Unauthorized();
        }

        return await notificationService.MarkAsReadAsync(notificationId, userId)
            ? NoContent()
            : NotFound();
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllAsRead()
    {
        if (User.GetUserId() is not { } userId)
        {
            return Unauthorized();
        }

        await notificationService.MarkAllAsReadAsync(userId);
        return NoContent();
    }
}
