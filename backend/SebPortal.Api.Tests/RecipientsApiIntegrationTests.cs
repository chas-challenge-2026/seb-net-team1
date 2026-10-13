using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>Exercises saved recipients through authorization, validation and the HTTP contract.</summary>
public sealed class RecipientsApiIntegrationTests
{
    private const string Iban = "SE4550000000054910000099";

    [Theory]
    [InlineData("GET")]
    [InlineData("POST")]
    public async Task Recipients_WithoutAuthentication_ReturnsUnauthorized(string method)
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), "/api/recipients");
        if (method == "POST") request.Content = JsonContent.Create(ValidRequest());

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData(UserRoles.Initiator, HttpStatusCode.Created)]
    [InlineData(UserRoles.Admin, HttpStatusCode.Created)]
    [InlineData(UserRoles.Attestant, HttpStatusCode.Forbidden)]
    public async Task CreateRecipient_OnlyInitiatorAndAdminCanSave(string role, HttpStatusCode expected)
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateAuthenticatedClient(role: role);

        using var response = await client.PostAsJsonAsync("/api/recipients", ValidRequest());

        Assert.Equal(expected, response.StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        Assert.Equal(expected == HttpStatusCode.Created ? 1 : 0, await db.Recipients.CountAsync());
        Assert.Equal(expected == HttpStatusCode.Created ? 1 : 0, await db.AuditEntries.CountAsync());
    }

    [Theory]
    [InlineData(UserRoles.Initiator)]
    [InlineData(UserRoles.Admin)]
    [InlineData(UserRoles.Attestant)]
    public async Task GetRecipients_AuthenticatedRolesCanReadTenantList(string role)
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateAuthenticatedClient(role: role);

        using var response = await client.GetAsync("/api/recipients");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = await ReadJsonAsync(response);
        Assert.Empty(body.RootElement.GetProperty("recipients").EnumerateArray());
        Assert.True(body.RootElement.GetProperty("demoConfirmationEnabled").GetBoolean());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task CreateRecipient_WithoutExplicitDemoConfirmation_IsRejected(bool omitConfirmation)
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateAuthenticatedClient();
        object request = omitConfirmation
            ? new { name = "Leverantoren", iban = Iban }
            : new { name = "Leverantoren", iban = Iban, demoConfirmed = false };

        using var response = await client.PostAsJsonAsync("/api/recipients", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertNoWritesAsync(factory);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(" \t\n ")]
    public async Task CreateRecipient_WithMissingOrBlankName_IsRejected(string? name)
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateAuthenticatedClient();

        using var response = await client.PostAsJsonAsync("/api/recipients",
            new { name, iban = Iban, demoConfirmed = true });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertNoWritesAsync(factory);
    }

    [Theory]
    [InlineData(1, HttpStatusCode.Created)]
    [InlineData(100, HttpStatusCode.Created)]
    [InlineData(101, HttpStatusCode.BadRequest)]
    public async Task CreateRecipient_ValidatesTrimmedNameLength(int length, HttpStatusCode expected)
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateAuthenticatedClient();
        var name = new string('N', length);

        using var response = await client.PostAsJsonAsync("/api/recipients",
            new { name = $"  {name}  ", iban = Iban, demoConfirmed = true });

        Assert.Equal(expected, response.StatusCode);
        if (expected == HttpStatusCode.Created)
        {
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            Assert.Equal(name, (await db.Recipients.SingleAsync()).Name);
        }
        else
        {
            await AssertNoWritesAsync(factory);
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("SE12")]
    [InlineData("S14550000000054910000099")]
    [InlineData("SEAA50000000054910000099")]
    [InlineData("SE45500000000549100000-9")]
    [InlineData("SE45500000000549100000å9")]
    [InlineData("SE45123456789012345678901234567890123")]
    public async Task CreateRecipient_WithInvalidIbanFormat_IsRejected(string? iban)
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateAuthenticatedClient();

        using var response = await client.PostAsJsonAsync("/api/recipients",
            new { name = "Leverantoren", iban, demoConfirmed = true });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await AssertNoWritesAsync(factory);
    }

    [Fact]
    public async Task CreateRecipient_NormalizesInput_PersistsAndReturnsItWithSimulatedAudit()
    {
        using var factory = new RecipientsApiFactory();
        using var creator = factory.CreateAuthenticatedClient();
        var startedAt = DateTime.UtcNow;

        using var created = await creator.PostAsJsonAsync("/api/recipients", new
        {
            name = "  Leverantoren AB  ",
            iban = " se45 5000\t0000 0549\n1000 0099 ",
            demoConfirmed = true
        });

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var createdBody = await ReadJsonAsync(created);
        var recipientId = createdBody.RootElement.GetProperty("id").GetInt32();
        Assert.True(recipientId > 0);
        Assert.Equal("Leverantoren AB", createdBody.RootElement.GetProperty("name").GetString());
        Assert.Equal(Iban, createdBody.RootElement.GetProperty("iban").GetString());
        Assert.InRange(createdBody.RootElement.GetProperty("createdAt").GetDateTime(),
            startedAt.AddSeconds(-1), DateTime.UtcNow.AddSeconds(1));

        using var reader = factory.CreateAuthenticatedClient(userId: 2, role: UserRoles.Attestant);
        using var listed = await reader.GetAsync("/api/recipients");
        Assert.Equal(HttpStatusCode.OK, listed.StatusCode);
        using var listedBody = await ReadJsonAsync(listed);
        var listedRecipient = Assert.Single(listedBody.RootElement.GetProperty("recipients").EnumerateArray());
        Assert.Equal(recipientId, listedRecipient.GetProperty("id").GetInt32());
        Assert.Equal("Leverantoren AB", listedRecipient.GetProperty("name").GetString());
        Assert.Equal(Iban, listedRecipient.GetProperty("iban").GetString());
        Assert.Equal(createdBody.RootElement.GetProperty("createdAt").GetDateTime(),
            listedRecipient.GetProperty("createdAt").GetDateTime());
        Assert.True(listedBody.RootElement.GetProperty("demoConfirmationEnabled").GetBoolean());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        var recipient = await db.Recipients.AsNoTracking().SingleAsync();
        Assert.Equal(recipientId, recipient.Id);
        Assert.Equal(1, recipient.TenantId);
        Assert.Equal("Leverantoren AB", recipient.Name);
        Assert.Equal(Iban, recipient.Iban);
        AssertSimulatedAudit(await db.AuditEntries.AsNoTracking().SingleAsync(), recipientId);
    }

    [Fact]
    public async Task CreateRecipient_DuplicateNormalizedIban_ReturnsConflictAndPreservesOriginal()
    {
        using var factory = new RecipientsApiFactory();
        using var creator = factory.CreateAuthenticatedClient();
        using var first = await creator.PostAsJsonAsync("/api/recipients", ValidRequest());
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        using var firstBody = await ReadJsonAsync(first);

        using var colleague = factory.CreateAuthenticatedClient(userId: 2, role: UserRoles.Admin);
        using var duplicate = await colleague.PostAsJsonAsync("/api/recipients", new
        {
            name = "Overwritten name",
            iban = "se45 5000 0000 0549 1000 0099",
            demoConfirmed = true
        });

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        var recipient = await db.Recipients.AsNoTracking().SingleAsync();
        Assert.Equal(firstBody.RootElement.GetProperty("id").GetInt32(), recipient.Id);
        Assert.Equal("Leverantoren", recipient.Name);
        Assert.Equal(Iban, recipient.Iban);
        Assert.Equal(firstBody.RootElement.GetProperty("createdAt").GetDateTime(), recipient.CreatedAt);
        Assert.Single(await db.AuditEntries.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task Recipients_AreSharedWithinTenantAndIsolatedFromOtherTenants()
    {
        using var factory = new RecipientsApiFactory();
        using var firstTenant = factory.CreateAuthenticatedClient();
        using var created = await firstTenant.PostAsJsonAsync("/api/recipients", ValidRequest());
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        using var secondTenant = factory.CreateAuthenticatedClient(userId: 3, tenantId: 2);
        using var beforeCreation = await secondTenant.GetAsync("/api/recipients");
        Assert.Equal(HttpStatusCode.OK, beforeCreation.StatusCode);
        using var beforeBody = await ReadJsonAsync(beforeCreation);
        Assert.Empty(beforeBody.RootElement.GetProperty("recipients").EnumerateArray());

        // A client-supplied tenant id must not override the authenticated tenant.
        using var otherCreated = await secondTenant.PostAsJsonAsync("/api/recipients", new
        {
            name = "Other tenant supplier", iban = Iban, demoConfirmed = true, tenantId = 1
        });
        Assert.Equal(HttpStatusCode.Created, otherCreated.StatusCode);

        using var colleague = factory.CreateAuthenticatedClient(userId: 2, role: UserRoles.Admin);
        using var colleagueList = await colleague.GetAsync("/api/recipients");
        using var colleagueBody = await ReadJsonAsync(colleagueList);
        Assert.Equal("Leverantoren", Assert.Single(colleagueBody.RootElement
            .GetProperty("recipients").EnumerateArray()).GetProperty("name").GetString());

        using var otherList = await secondTenant.GetAsync("/api/recipients");
        using var otherBody = await ReadJsonAsync(otherList);
        Assert.Equal("Other tenant supplier", Assert.Single(otherBody.RootElement
            .GetProperty("recipients").EnumerateArray()).GetProperty("name").GetString());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        Assert.Equal(new[] { 1, 2 }, await db.Recipients.OrderBy(r => r.TenantId)
            .Select(r => r.TenantId).ToArrayAsync());
        Assert.Equal(new[] { 1, 2 }, await db.AuditEntries.OrderBy(a => a.TenantId)
            .Select(a => a.TenantId).ToArrayAsync());
    }

    [Theory]
    [InlineData("Development", null, true)]
    [InlineData("Production", null, false)]
    [InlineData("Production", false, false)]
    [InlineData("Production", true, true)]
    [InlineData("Testing", null, false)]
    public async Task DemoConfirmation_IsGatedByEnvironmentAndExplicitConfiguration(
        string environment, bool? allowDemoConfirmation, bool enabled)
    {
        using var factory = new RecipientsApiFactory(environment, allowDemoConfirmation);
        using var client = factory.CreateAuthenticatedClient();

        using var list = await client.GetAsync("/api/recipients");
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        using var body = await ReadJsonAsync(list);
        Assert.Equal(enabled, body.RootElement.GetProperty("demoConfirmationEnabled").GetBoolean());

        using var created = await client.PostAsJsonAsync("/api/recipients", ValidRequest());
        Assert.Equal(enabled ? HttpStatusCode.Created : HttpStatusCode.Forbidden, created.StatusCode);
        if (!enabled) await AssertNoWritesAsync(factory);
    }

    [Theory]
    [InlineData("missing", false)]
    [InlineData("invalid", false)]
    [InlineData("valid", true)]
    [InlineData("missing", true)]
    public async Task CreateRecipient_WithCookieAuthentication_RequiresValidCsrf(
        string csrfCase, bool addBearerHeader)
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
            HandleCookies = false
        });
        var jwt = factory.CreateToken(UserRoles.Initiator, 1, 1);
        client.DefaultRequestHeaders.Add("Cookie", $"SebPortal.Auth={jwt}");
        if (addBearerHeader)
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

        using var csrfResponse = await client.GetAsync("/api/auth/csrf");
        Assert.Equal(HttpStatusCode.OK, csrfResponse.StatusCode);
        using var csrfBody = await ReadJsonAsync(csrfResponse);
        var csrfCookie = Assert.Single(SetCookieHeaderValue.ParseList(
            csrfResponse.Headers.GetValues("Set-Cookie").ToList()), cookie => cookie.Name == "SebPortal.Csrf");
        client.DefaultRequestHeaders.Remove("Cookie");
        client.DefaultRequestHeaders.Add("Cookie",
            $"SebPortal.Auth={jwt}; SebPortal.Csrf={csrfCookie.Value}");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/recipients")
        {
            Content = JsonContent.Create(ValidRequest())
        };
        if (csrfCase != "missing") request.Headers.Add("X-CSRF-TOKEN",
            csrfCase == "valid"
                ? csrfBody.RootElement.GetProperty("requestToken").GetString()
                : "invalid-csrf-token");

        using var response = await client.SendAsync(request);

        Assert.Equal(csrfCase == "valid" ? HttpStatusCode.Created : HttpStatusCode.BadRequest,
            response.StatusCode);
        if (csrfCase != "valid") await AssertNoWritesAsync(factory);
    }

    internal static void AssertSimulatedAudit(AuditEntry audit, int recipientId)
    {
        Assert.Equal("CREATE_RECIPIENT", audit.Action);
        Assert.Equal("recipient", audit.EntityType);
        Assert.Equal(recipientId, audit.EntityId);
        Assert.Equal(1, audit.TenantId);
        Assert.Equal(1, audit.UserId);
        Assert.Equal("GENESIS", audit.PreviousSignature);
        Assert.False(string.IsNullOrWhiteSpace(audit.Signature));
        var description = Assert.IsType<string>(audit.Description).ToLowerInvariant();
        Assert.Contains("demo", description);
        Assert.True(description.Contains("simuler") || description.Contains("simulat"), description);
    }

    private static object ValidRequest() => new { name = "Leverantoren", iban = Iban, demoConfirmed = true };

    private static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync());

    private static async Task AssertNoWritesAsync(RecipientsApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        Assert.Empty(await db.Recipients.AsNoTracking().ToListAsync());
        Assert.Empty(await db.AuditEntries.AsNoTracking().ToListAsync());
    }
}

/// <summary>Every factory instance has a separate database; it never connects to the demo database.</summary>
internal sealed class RecipientsApiFactory(
    string environment = "Development", bool? allowDemoConfirmation = null) : WebApplicationFactory<Program>
{
    private readonly string _databaseName = $"RecipientsApiTests-{Guid.NewGuid():N}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);
        builder.ConfigureLogging(logging => logging.ClearProviders());
        builder.UseSetting("Jwt:Key", "IntegrationTestSigningKeyOnly-NotForProduction-1234567890");
        builder.UseSetting("Jwt:PreviousKey", "");
        builder.UseSetting("Auth:AllowInsecureCookies", "false");
        if (allowDemoConfirmation.HasValue)
            builder.UseSetting("Recipients:AllowDemoConfirmation", allowDemoConfirmation.Value.ToString());
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<SebDbContext>();
            services.RemoveAll<DbContextOptions<SebDbContext>>();
            services.AddDbContext<SebDbContext>(options => options.UseInMemoryDatabase(_databaseName));
            services.AddDataProtection().UseEphemeralDataProtectionProvider();
        });
    }

    public HttpClient CreateAuthenticatedClient(
        string role = UserRoles.Initiator, int userId = 1, int tenantId = 1)
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false
        });
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", CreateToken(role, userId, tenantId));
        return client;
    }

    public string CreateToken(string role, int userId, int tenantId)
    {
        using var scope = Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<JwtTokenService>()
            .GenerateToken(userId, tenantId, $"recipient-{userId}@example.invalid", role, $"User {userId}");
    }
}
