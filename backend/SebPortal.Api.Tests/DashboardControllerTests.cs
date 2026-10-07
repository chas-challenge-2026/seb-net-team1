using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Controllers;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace SebPortal.Api.Tests;

public class DashboardControllerTests
{
    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(options);
    }

    private static void SetAuthenticatedUser(
        DashboardController controller,
        int userId = 1,
        int tenantId = 1,
        string role = "attestant")
    {
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
                    new Claim("tenantId", tenantId.ToString()),
                    new Claim(ClaimTypes.Role, role)
                }, "TestAuth"))
            }
        };
    }

    [Fact]
    public async Task Get_ReturnsUnauthorized_WhenNoMatchingUser()
    {
        // Arrange: empty database
        using var db = CreateContext();
        var controller = new DashboardController(new DashboardService(new DashboardRepository(db)));
        SetAuthenticatedUser(controller);

        // Act
        var result = await controller.Get();

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public async Task Get_ReturnsOk_WhenUserExists()
    {
        // Arrange
        using var db = CreateContext();
        db.Tenants.Add(new Tenant { Id = 1, Name = "Runö Bygg AB" });
        db.Users.Add(new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Papper Pappersson",
            Email = "papper@runobygg.se",
            Role = "attestant"
        });
        db.SaveChanges();
        var controller = new DashboardController(new DashboardService(new DashboardRepository(db)));
        SetAuthenticatedUser(controller);

        // Act
        var result = await controller.Get();

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }
}
