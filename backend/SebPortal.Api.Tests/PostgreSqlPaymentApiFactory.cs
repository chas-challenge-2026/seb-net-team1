using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using SebPortal.Api.Data;

namespace SebPortal.Api.Tests;

/// <summary>
/// Starts the API with a real temporary PostgreSQL database
/// for concurrency integration tests.
/// </summary>
public sealed class PostgreSqlPaymentApiFactory(
    string connectionString) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(
        IWebHostBuilder builder)
    {
        builder.UseSetting(
            "Jwt:Key",
            "IntegrationTestSigningKeyOnly-NotForProduction-1234567890");
        builder.UseSetting("Jwt:PreviousKey", "");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<SebDbContext>();
            services.RemoveAll<DbContextOptions<SebDbContext>>();

            services.AddDbContext<SebDbContext>(options =>
                options.UseNpgsql(connectionString));
        });
    }
}
