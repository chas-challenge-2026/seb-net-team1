using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SebPortal.Api.Data;

namespace SebPortal.Api.Tests;

/// <summary>
/// Starts the API with an isolated in-memory database for approval integration tests.
/// </summary>
public class ApprovalApiFactory : WebApplicationFactory<Program>
{
    private readonly string _databaseName =
        $"ApprovalApiTests-{Guid.NewGuid()}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("Jwt:Key", "IntegrationTestSigningKeyOnly-NotForProduction-1234567890");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<SebDbContext>();
            services.RemoveAll<DbContextOptions<SebDbContext>>();

            services.AddDbContext<SebDbContext>(options =>
                options.UseInMemoryDatabase(_databaseName));
        });
    }
}
