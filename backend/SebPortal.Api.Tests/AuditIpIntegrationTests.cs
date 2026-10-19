using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>Verifies audit IP capture through HTTP, proxy handling and both read APIs.</summary>
public sealed class AuditIpIntegrationTests
{
    [Theory]
    [InlineData("198.51.100.17", null, "198.51.100.17")]
    [InlineData("192.0.2.10", "198.51.100.23", "198.51.100.23")]
    [InlineData("192.0.2.11", "198.51.100.23", "192.0.2.11")]
    [InlineData("2001:db8::51", null, "2001:db8::51")]
    [InlineData("::ffff:198.51.100.31", null, "198.51.100.31")]
    [InlineData(null, null, null)]
    public async Task CreatePayment_RecordsResolvedClientIp_AndReadersSeeOriginalIp(
        string? remoteIp, string? forwardedIp, string? expectedIp)
    {
        using var factory = new AuditIpApiFactory();
        await SeedAsync(factory);
        var writerToken = CreateToken(factory, 1, UserRoles.Admin);
        var readerToken = CreateToken(factory, 2, UserRoles.Attestant);

        var created = await SendAsync(factory, "POST", "/api/payments", writerToken,
            remoteIp, forwardedIp, new
            {
                fromAccountId = 1,
                toIban = "SE4550000000054910000099",
                amount = 125.50m,
                reference = "Audit IP integration test"
            });

        Assert.Equal(StatusCodes.Status201Created, created.Response.StatusCode);
        using var createdBody = await JsonDocument.ParseAsync(created.Response.Body);
        var paymentId = createdBody.RootElement.GetProperty("id").GetInt32();
        var auditId = await AssertPersistedEntryAsync(factory, paymentId, expectedIp);

        // Reading from a different address must never replace the recorded writer address.
        const string readerIp = "203.0.113.200";
        var auditResponse = await SendAsync(factory, "GET", "/api/audit-log", readerToken,
            readerIp);
        Assert.Equal(StatusCodes.Status200OK, auditResponse.Response.StatusCode);
        using var auditBody = await JsonDocument.ParseAsync(auditResponse.Response.Body);
        var auditEntry = Assert.Single(auditBody.RootElement.GetProperty("entries").EnumerateArray());
        Assert.Equal(auditId, auditEntry.GetProperty("id").GetInt32());
        Assert.Equal(expectedIp, auditEntry.GetProperty("ipAddress").GetString());
        Assert.Equal("Writer", auditEntry.GetProperty("userName").GetString());

        var paymentResponse = await SendAsync(factory, "GET", $"/api/payments/{paymentId}",
            readerToken, readerIp);
        Assert.Equal(StatusCodes.Status200OK, paymentResponse.Response.StatusCode);
        using var paymentBody = await JsonDocument.ParseAsync(paymentResponse.Response.Body);
        var activity = Assert.Single(paymentBody.RootElement.GetProperty("activity").EnumerateArray());
        Assert.Equal(auditId, activity.GetProperty("id").GetInt32());
        Assert.Equal(expectedIp, activity.GetProperty("ipAddress").GetString());
        Assert.Equal("Writer", activity.GetProperty("userName").GetString());

        Assert.Equal(auditId, await AssertPersistedEntryAsync(factory, paymentId, expectedIp));
    }

    private static async Task SeedAsync(AuditIpApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        db.Tenants.Add(new Tenant { Id = 1, Name = "Audit IP tests" });
        db.Users.AddRange(
            new User { Id = 1, TenantId = 1, Name = "Writer", Role = UserRoles.Admin },
            new User { Id = 2, TenantId = 1, Name = "Reader", Role = UserRoles.Attestant });
        db.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Test account",
            Iban = "SE3550000000054910000003",
            Balance = 1000m,
            Currency = "SEK"
        });
        await db.SaveChangesAsync();
    }

    private static string CreateToken(AuditIpApiFactory factory, int userId, string role)
    {
        using var scope = factory.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<JwtTokenService>().GenerateToken(
            userId, 1, $"audit-ip-{userId}@example.invalid", role,
            userId == 1 ? "Writer" : "Reader");
    }

    private static async Task<int> AssertPersistedEntryAsync(
        AuditIpApiFactory factory, int paymentId, string? expectedIp)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        var entry = Assert.Single(await db.AuditEntries.AsNoTracking().ToListAsync());
        Assert.Equal("CREATE_PAYMENT", entry.Action);
        Assert.Equal("payment", entry.EntityType);
        Assert.Equal(paymentId, entry.EntityId);
        Assert.Equal(1, entry.UserId);
        Assert.Equal(1, entry.TenantId);
        Assert.Equal(expectedIp, entry.IpAddress);
        Assert.Equal(PaymentStatuses.Completed, (await db.Payments.AsNoTracking().SingleAsync()).Status);
        return entry.Id;
    }

    private static async Task<HttpContext> SendAsync(
        AuditIpApiFactory factory, string method, string path, string token,
        string? remoteIp, string? forwardedIp = null, object? body = null)
    {
        using var requestBody = body is null
            ? null
            : new MemoryStream(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(body)));

        return await factory.Server.SendAsync(context =>
        {
            context.Connection.RemoteIpAddress = remoteIp is null ? null : IPAddress.Parse(remoteIp);
            context.Request.Scheme = "https";
            context.Request.Host = new HostString("localhost");
            context.Request.Method = method;
            context.Request.Path = path;
            context.Request.Headers.Authorization = $"Bearer {token}";
            if (forwardedIp is not null)
                context.Request.Headers["X-Forwarded-For"] = forwardedIp;
            if (requestBody is not null)
            {
                context.Request.ContentType = "application/json";
                context.Request.ContentLength = requestBody.Length;
                context.Request.Body = requestBody;
            }
        });
    }

    private sealed class AuditIpApiFactory : PaymentApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureServices(services =>
            {
                services.PostConfigure<ForwardedHeadersOptions>(options =>
                {
                    options.KnownNetworks.Clear();
                    options.KnownProxies.Clear();
                    options.KnownProxies.Add(IPAddress.Parse("192.0.2.10"));
                });
            });
        }
    }
}
