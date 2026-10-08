using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

public class ReportsApiIntegrationTests
{
    private const string Period = "/api/reports/payments?from=2026-10-01&to=2026-10-08";

    private static async Task SeedAsync(ApprovalApiFactory factory, params Payment[] payments)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        db.Tenants.AddRange(
            new Tenant { Id = 1, Name = "Rapportföretaget" },
            new Tenant { Id = 2, Name = "Annat företag" });
        db.Users.AddRange(
            new User { Id = 1, TenantId = 1, Name = "Rapportanvändare", Email = "report@example.test", Role = UserRoles.Attestant },
            new User { Id = 2, TenantId = 2, Name = "Annan användare", Email = "other@example.test", Role = UserRoles.Admin });
        db.Accounts.AddRange(
            new Account { Id = 1, TenantId = 1, AccountName = "Driftkonto", Iban = "SE3550000000054910000003", Balance = 1000m },
            new Account { Id = 2, TenantId = 2, AccountName = "Annat företags konto", Iban = "SE4550000000054910000099", Balance = 2000m });
        db.Payments.AddRange(payments);
        await db.SaveChangesAsync();
    }

    private static HttpClient CreateClient(
        ApprovalApiFactory factory,
        int? userId = 1,
        int tenantId = 1,
        string role = UserRoles.Attestant)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false
        });
        if (userId is not null)
        {
            using var scope = factory.Services.CreateScope();
            var token = scope.ServiceProvider.GetRequiredService<JwtTokenService>()
                .GenerateToken(userId.Value, tenantId, "report@example.test", role, "Rapportanvändare");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
        return client;
    }

    private static Payment PaymentAt(int id, DateTime createdAt, int tenantId = 1) => new()
    {
        Id = id,
        TenantId = tenantId,
        FromAccountId = tenantId,
        ToIban = "SE4550000000054910000099",
        Amount = 1250.50m,
        Reference = $"Faktura {id}",
        Status = PaymentStatuses.Completed,
        CreatedAt = createdAt
    };

    private static DateTime Utc(string value) =>
        DateTime.Parse(value, System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AdjustToUniversal | System.Globalization.DateTimeStyles.AssumeUniversal);

    [Fact]
    public async Task GetPayments_WithoutToken_ReturnsUnauthorized()
    {
        using var factory = new ApprovalApiFactory();
        using var client = CreateClient(factory, userId: null);
        var response = await client.GetAsync(Period);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(UserRoles.Initiator)]
    [InlineData(UserRoles.Attestant)]
    [InlineData(UserRoles.Admin)]
    public async Task GetPayments_AllAuthenticatedRolesCanReadTheirTenant(string role)
    {
        using var factory = new ApprovalApiFactory();
        await SeedAsync(factory,
            PaymentAt(1, Utc("2026-10-08T12:00:00Z")),
            PaymentAt(2, Utc("2026-10-08T12:00:00Z"), tenantId: 2));
        using var client = CreateClient(factory, role: role);

        var response = await client.GetAsync(Period + "&tenantId=2");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var report = await response.Content.ReadFromJsonAsync<PaymentReportResponse>();
        Assert.Equal(1, Assert.Single(report!.Payments).Id);
    }

    [Theory]
    [InlineData(999, 1)]
    [InlineData(1, 2)]
    public async Task GetPayments_WhenUserDoesNotBelongToClaimedTenant_ReturnsUnauthorized(int userId, int tenantId)
    {
        using var factory = new ApprovalApiFactory();
        await SeedAsync(factory);
        using var client = CreateClient(factory, userId, tenantId);
        var response = await client.GetAsync(Period);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("?from=2026-10-01")]
    [InlineData("?to=2026-10-08")]
    [InlineData("?from=&to=2026-10-08")]
    [InlineData("?from=2026-10-01&to=")]
    [InlineData("?from=2026-10-09&to=2026-10-08")]
    [InlineData("?from=2026-02-29&to=2026-10-08")]
    [InlineData("?from=2026-10-01&to=2026-13-08")]
    [InlineData("?from=2026-1-01&to=2026-10-08")]
    [InlineData("?from=2026-10-01T00:00:00Z&to=2026-10-08")]
    [InlineData("?from=%202026-10-01&to=2026-10-08")]
    [InlineData("?from=2026-10-01&to=9999-12-31")]
    public async Task GetPayments_InvalidPeriod_ReturnsSafeSwedishProblemDetails(string query)
    {
        using var factory = new ApprovalApiFactory();
        await SeedAsync(factory);
        using var client = CreateClient(factory);
        var response = await client.GetAsync("/api/reports/payments" + query);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Equal(400, problem!.Status);
        Assert.Contains(problem.Detail!, new[]
        {
            "Ange både från- och tilldatum som giltiga datum i formatet ÅÅÅÅ-MM-DD.",
            "Fråndatum får inte vara efter tilldatum.",
            "Perioden ligger utanför det datumintervall som stöds."
        });
        Assert.DoesNotContain("Exception", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GetPayments_IncludesFirstAndLastInstants_ExcludesOutsidePeriod()
    {
        using var factory = new ApprovalApiFactory();
        var first = Utc("2026-09-30T22:00:00Z");
        var nextDay = Utc("2026-10-08T22:00:00Z");
        await SeedAsync(factory,
            PaymentAt(1, first.AddTicks(-1)),
            PaymentAt(2, first),
            PaymentAt(3, nextDay.AddTicks(-1)),
            PaymentAt(4, nextDay));
        using var client = CreateClient(factory);

        var report = await client.GetFromJsonAsync<PaymentReportResponse>(Period);

        Assert.Equal("2026-10-01", report!.From);
        Assert.Equal("2026-10-08", report.To);
        Assert.Equal("Europe/Stockholm", report.TimeZone);
        Assert.Equal(new[] { 3, 2 }, report.Payments.Select(p => p.Id));
    }

    [Theory]
    [InlineData("2026-03-29", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z", "2026-03-29T01:30:00Z")]
    [InlineData("2026-10-25", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z", "2026-10-25T22:30:00Z")]
    public async Task GetPayments_SameDayUsesStockholmDstBoundaries(
        string day, string start, string end, string interior)
    {
        using var factory = new ApprovalApiFactory();
        await SeedAsync(factory,
            PaymentAt(1, Utc(start).AddTicks(-1)),
            PaymentAt(2, Utc(start)),
            PaymentAt(3, Utc(interior)),
            PaymentAt(4, Utc(end).AddTicks(-1)),
            PaymentAt(5, Utc(end)));
        using var client = CreateClient(factory);
        // Browser-supplied zones have no bearing on this fixed Stockholm calendar.
        var report = await client.GetFromJsonAsync<PaymentReportResponse>(
            $"/api/reports/payments?from={day}&to={day}&timeZone=America/Los_Angeles");
        Assert.Equal(new[] { 4, 3, 2 }, report!.Payments.Select(p => p.Id));
    }

    [Fact]
    public async Task GetPayments_ReturnsEveryStatusAndMoreThanTwentyRows_InStableOrder()
    {
        using var factory = new ApprovalApiFactory();
        var statuses = new[] { PaymentStatuses.Completed, PaymentStatuses.PendingApproval, PaymentStatuses.Rejected };
        var payments = Enumerable.Range(1, 25).Select(id =>
        {
            var payment = PaymentAt(id, Utc("2026-10-08T12:00:00Z"));
            payment.Status = statuses[id % statuses.Length];
            return payment;
        }).ToArray();
        await SeedAsync(factory, payments);
        using var client = CreateClient(factory);
        var report = await client.GetFromJsonAsync<PaymentReportResponse>(Period);
        Assert.Equal(Enumerable.Range(1, 25).Reverse(), report!.Payments.Select(p => p.Id));
        Assert.Equal(statuses.Order(), report.Payments.Select(p => p.Status).Distinct().Order());
    }

    [Fact]
    public async Task GetPayments_EmptyPeriodReturnsEmptyCollection()
    {
        using var factory = new ApprovalApiFactory();
        await SeedAsync(factory);
        using var client = CreateClient(factory);
        var report = await client.GetFromJsonAsync<PaymentReportResponse>(Period);
        Assert.Empty(report!.Payments);
    }

    [Fact]
    public async Task GetPayments_LegacyUtcTimestampAndMoneyHaveStableJsonContract()
    {
        using var factory = new ApprovalApiFactory();
        var payment = PaymentAt(1, new DateTime(2026, 10, 8, 12, 30, 0, DateTimeKind.Unspecified));
        payment.Reference = null;
        await SeedAsync(factory, payment);
        using var client = CreateClient(factory);

        using var json = JsonDocument.Parse(await client.GetStringAsync(Period));
        var row = json.RootElement.GetProperty("payments")[0];
        Assert.Equal("2026-10-08T12:30:00Z", row.GetProperty("createdAt").GetString());
        Assert.Equal("1250.50", row.GetProperty("amount").GetString());
        Assert.Equal("", row.GetProperty("reference").GetString());
        Assert.Equal("Driftkonto", row.GetProperty("fromAccountName").GetString());
        Assert.Equal("SEK", row.GetProperty("currency").GetString());
    }

    [Theory]
    [InlineData(2)]
    [InlineData(999)]
    public async Task GetPayments_DoesNotExposeAnotherTenantOrMissingAccountName(int accountId)
    {
        using var factory = new ApprovalApiFactory();
        var payment = PaymentAt(1, Utc("2026-10-08T12:00:00Z"));
        payment.FromAccountId = accountId;
        await SeedAsync(factory, payment);
        using var client = CreateClient(factory);
        var report = await client.GetFromJsonAsync<PaymentReportResponse>(Period);
        Assert.Null(Assert.Single(report!.Payments).FromAccountName);
    }
}
