using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Controllers;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Signing;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Xunit;

namespace SebPortal.Api.Tests;

/// <summary>
/// Boundary value tests for the limit query parameter, matching the CTO
/// feedback to test the value just below and just above a boundary, not only
/// clearly-valid and clearly-invalid values in the middle.
///
/// AuditLogController.GetAuditLog: effectiveLimit = limit is > 0 and <= 200
/// ? limit.Value : 50. The boundaries are 0/1 (just below/at the lower edge)
/// and 200/201 (at/just above the upper edge).
/// </summary>
public class AuditLogControllerTests
{
    private const int DefaultLimit = 50;

    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(options);
    }

    private static AuditLogController CreateController(SebDbContext db, int tenantId = 1)
    {
        var service = new AuditService(
            new AuditRepository(db), new AuditLockProvider(), new UnsignedPlaceholderAuditSigner());

        var controller = new AuditLogController(service);
        SetAuthenticatedUser(controller, tenantId);
        return controller;
    }

    // Same pattern as DashboardControllerTests.SetAuthenticatedUser.
    private static void SetAuthenticatedUser(AuditLogController controller, int tenantId)
    {
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(JwtRegisteredClaimNames.Sub, "1"),
                    new Claim("tenantId", tenantId.ToString())
                }, "TestAuth"))
            }
        };
    }

    private static async Task SeedEntriesAsync(SebDbContext db, int tenantId, int count)
    {
        db.Tenants.Add(new Tenant { Id = tenantId, Name = "Runö Bygg AB" });
        db.SaveChanges();

        var service = new AuditService(
            new AuditRepository(db), new AuditLockProvider(), new UnsignedPlaceholderAuditSigner());

        for (var i = 1; i <= count; i++)
        {
            var tenantLock = service.GetTenantLock(tenantId);
            await tenantLock.WaitAsync();
            try
            {
                await service.AppendEntryAsync(tenantId, 5, "CREATE_PAYMENT", "payment", i, $"Entry {i}");
                await db.SaveChangesAsync();
            }
            finally
            {
                tenantLock.Release();
            }
        }
    }

    private static AuditLogResponseDto GetBody(IActionResult result) =>
        Assert.IsType<AuditLogResponseDto>(Assert.IsType<OkObjectResult>(result).Value);

    [Fact]
    public async Task GetAuditLog_LimitIsNull_UsesDefaultLimit()
    {
        using var db = CreateContext();
        await SeedEntriesAsync(db, 1, count: 60);
        var controller = CreateController(db);

        var body = GetBody(await controller.GetAuditLog(limit: null, cursor: null));

        Assert.Equal(DefaultLimit, body.Entries.Count);
    }

    [Fact]
    public async Task GetAuditLog_LimitIsZero_FallsBackToDefaultLimit()
    {
        // Just below the lower boundary (> 0). Zero is not a valid page size, it
        // must fall back rather than return an empty page or throw.
        using var db = CreateContext();
        await SeedEntriesAsync(db, 1, count: 60);
        var controller = CreateController(db);

        var body = GetBody(await controller.GetAuditLog(limit: 0, cursor: null));

        Assert.Equal(DefaultLimit, body.Entries.Count);
    }

    [Fact]
    public async Task GetAuditLog_LimitIsNegative_FallsBackToDefaultLimit()
    {
        using var db = CreateContext();
        await SeedEntriesAsync(db, 1, count: 60);
        var controller = CreateController(db);

        var body = GetBody(await controller.GetAuditLog(limit: -5, cursor: null));

        Assert.Equal(DefaultLimit, body.Entries.Count);
    }

    [Fact]
    public async Task GetAuditLog_LimitIsOne_IsAcceptedAsIs()
    {
        // At the lower boundary: the smallest valid limit.
        using var db = CreateContext();
        await SeedEntriesAsync(db, 1, count: 5);
        var controller = CreateController(db);

        var body = GetBody(await controller.GetAuditLog(limit: 1, cursor: null));

        Assert.Single(body.Entries);
    }

    [Fact]
    public async Task GetAuditLog_LimitIsExactlyTwoHundred_IsAcceptedAsIs()
    {
        // At the upper boundary: the largest valid limit, must not fall back.
        using var db = CreateContext();
        await SeedEntriesAsync(db, 1, count: 250);
        var controller = CreateController(db);

        var body = GetBody(await controller.GetAuditLog(limit: 200, cursor: null));

        Assert.Equal(200, body.Entries.Count);
    }

    [Fact]
    public async Task GetAuditLog_LimitIsTwoHundredAndOne_FallsBackToDefaultLimit()
    {
        // Just above the upper boundary. One more than the largest valid value
        // must fall back, not get silently clamped to 200 or accepted as is.
        using var db = CreateContext();
        await SeedEntriesAsync(db, 1, count: 250);
        var controller = CreateController(db);

        var body = GetBody(await controller.GetAuditLog(limit: 201, cursor: null));

        Assert.Equal(DefaultLimit, body.Entries.Count);
    }

    [Fact]
    public async Task GetAuditLog_ReturnsUnauthorized_WhenTokenHasNoTenantId()
    {
        using var db = CreateContext();
        db.SaveChanges();

        var service = new AuditService(
            new AuditRepository(db), new AuditLockProvider(), new UnsignedPlaceholderAuditSigner());
        var controller = new AuditLogController(service)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity()) // no claims at all
                }
            }
        };

        var result = await controller.GetAuditLog(limit: null, cursor: null);

        Assert.IsType<UnauthorizedObjectResult>(result);
    }
}