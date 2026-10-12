using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>Checks report boundaries against the legacy PostgreSQL timestamp type in an isolated container.</summary>
public sealed class ReportPostgreSqlIntegrationTests(PostgreSqlFixture postgres)
    : IClassFixture<PostgreSqlFixture>
{
    [Theory]
    [InlineData("2026-10-01", "2026-10-08", "2026-09-30T22:00:00Z", "2026-10-08T22:00:00Z")]
    [InlineData("2026-03-29", "2026-03-29", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z")]
    [InlineData("2026-10-25", "2026-10-25", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z")]
    public async Task GetPayments_LegacyTimestampBoundsDoNotDependOnDatabaseSessionZone(
        string from, string to, string start, string end)
    {
        // This database exists only inside PostgreSqlFixture's disposable container.
        var connectionString = new NpgsqlConnectionStringBuilder(postgres.ConnectionString)
        {
            Database = $"seb_report_{Guid.NewGuid():N}",
            Options = "-c TimeZone=UTC"
        }.ConnectionString;
        var startUtc = DateTime.Parse(start, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal);
        var endUtc = DateTime.Parse(end, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal);
        using (var seedFactory = new PostgreSqlPaymentApiFactory(connectionString))
        {
            using var scope = seedFactory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.Add(new Tenant { Id = 1, Name = "Rapporttest" });
            db.Users.Add(new User { Id = 1, TenantId = 1, Email = "report@example.test", Role = UserRoles.Attestant });
            db.Accounts.Add(new Account { Id = 1, TenantId = 1, AccountName = "Driftkonto", Balance = 1000m });
            var instants = new[] { startUtc.AddTicks(-10), startUtc, endUtc.AddTicks(-10), endUtc };
            db.Payments.AddRange(instants.Select((instant, index) => new Payment
            {
                Id = index + 1, TenantId = 1, FromAccountId = 1, Amount = 1250.5m,
                Status = PaymentStatuses.Completed, CreatedAt = instant
            }));
            await db.SaveChangesAsync();
            // Reproduce the application's existing TIMESTAMP WITHOUT TIME ZONE column.
            await db.Database.ExecuteSqlRawAsync("""
                ALTER TABLE payments ALTER COLUMN created_at
                TYPE timestamp without time zone USING created_at AT TIME ZONE 'UTC'
                """);
        }

        var nonUtcConnection = new NpgsqlConnectionStringBuilder(connectionString)
        {
            Options = "-c TimeZone=Pacific/Honolulu"
        }.ConnectionString;
        using var factory = new PostgreSqlPaymentApiFactory(nonUtcConnection);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false
        });
        using (var scope = factory.Services.CreateScope())
        {
            var token = scope.ServiceProvider.GetRequiredService<JwtTokenService>()
                .GenerateToken(1, 1, "report@example.test", UserRoles.Attestant, "Rapporttest");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        var report = await client.GetFromJsonAsync<PaymentReportResponse>(
            $"/api/reports/payments?from={from}&to={to}");

        Assert.Equal(new[] { 3, 2 }, report!.Payments.Select(p => p.Id));
        Assert.All(report.Payments, p => Assert.Equal(DateTimeKind.Utc, p.CreatedAt.Kind));
        Assert.Equal(startUtc, report.Payments[1].CreatedAt);
        Assert.All(report.Payments, p => Assert.Equal("Driftkonto", p.FromAccountName));
    }
}
