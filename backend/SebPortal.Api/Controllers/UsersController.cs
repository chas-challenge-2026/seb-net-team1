using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

/// <summary>User administration, admins only, always inside the admin's own tenant.</summary>
[ApiController]
[Authorize(Roles = UserRoles.Admin)]
[Route("api/[controller]")]
public class UsersController(UserService userService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<UserAdminDto>>> List()
    {
        if (User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await userService.GetUsersAsync(tenantId));
    }

    [HttpPost]
    public async Task<ActionResult<UserAdminDto>> Create(CreateUserRequest request)
    {
        if (User.GetUserId() is not { } adminId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        var user = await userService.CreateUserAsync(tenantId, adminId, request);
        return Created($"/api/users/{user.Id}", user);
    }

    [HttpPut("{userId:int}")]
    public async Task<ActionResult<UserAdminDto>> Update(int userId, UpdateUserRequest request)
    {
        if (User.GetUserId() is not { } adminId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await userService.UpdateUserAsync(tenantId, adminId, userId, request));
    }

    [HttpPost("{userId:int}/reset-password")]
    public async Task<IActionResult> ResetPassword(int userId, ResetPasswordRequest request)
    {
        if (User.GetUserId() is not { } adminId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        await userService.ResetPasswordAsync(tenantId, adminId, userId, request.NewPassword);
        return NoContent();
    }
}
