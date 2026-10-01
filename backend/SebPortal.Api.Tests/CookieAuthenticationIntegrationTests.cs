using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Net.Http.Headers;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>
/// Exercises browser authentication and CSRF protection through the HTTP pipeline.
/// </summary>
public class CookieAuthenticationIntegrationTests
    : IClassFixture<CookieAuthenticationApiFactory>
{
    private const string AuthCookieName = "SebPortal.Auth";
    private const string CsrfCookieName = "SebPortal.Csrf";
    private const string CsrfHeaderName = "X-CSRF-TOKEN";
    private readonly CookieAuthenticationApiFactory _factory;

    public CookieAuthenticationIntegrationTests(CookieAuthenticationApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Login_StoresJwtInHttpOnlyCookie_AndDoesNotExposeItInJson()
    {
        using var client = CreateClient();
        var beforeLogin = DateTimeOffset.UtcNow;
        using var response = await LoginAsync(client);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = await ReadJsonAsync(response);
        Assert.False(body.RootElement.TryGetProperty("accessToken", out _));
        Assert.Equal(CookieAuthenticationApiFactory.Email,
            body.RootElement.GetProperty("user").GetProperty("email").GetString());

        var cookie = GetCookie(response, AuthCookieName);
        Assert.True(cookie.HttpOnly);
        Assert.True(cookie.Secure);
        Assert.Equal(Microsoft.Net.Http.Headers.SameSiteMode.Strict, cookie.SameSite);
        Assert.Equal("/api", cookie.Path.ToString());
        Assert.True(cookie.Expires.HasValue);
        Assert.InRange(cookie.Expires!.Value,
            beforeLogin.AddHours(2).AddSeconds(-1), DateTimeOffset.UtcNow.AddHours(2));
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(cookie.Value.ToString());
        Assert.Equal(jwt.ValidTo, cookie.Expires.Value.UtcDateTime);

        using var dashboard = await client.GetAsync("/api/dashboard");
        Assert.Equal(HttpStatusCode.OK, dashboard.StatusCode);
    }

    [Fact]
    public async Task CsrfEndpoint_ReturnsUncachedTokenAndHttpOnlyCookie()
    {
        using var client = CreateClient();
        using var response = await client.GetAsync("/api/auth/csrf");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        using var body = await ReadJsonAsync(response);
        Assert.False(string.IsNullOrWhiteSpace(
            body.RootElement.GetProperty("requestToken").GetString()));
        var cookie = GetCookie(response, CsrfCookieName);
        Assert.True(cookie.HttpOnly);
        Assert.True(cookie.Secure);
        Assert.Equal(Microsoft.Net.Http.Headers.SameSiteMode.Strict, cookie.SameSite);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("invalid")]
    [InlineData("another-session")]
    public async Task Login_WithoutMatchingCsrfToken_IsRejected(string csrfCase)
    {
        using var client = CreateClient();
        var csrf = await GetRejectedCsrfAsync(client, csrfCase);
        using var response = await PostAsync(client, "/api/auth/login", Credentials(), csrf);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(HasCookie(response, AuthCookieName));
        using var dashboard = await client.GetAsync("/api/dashboard");
        Assert.Equal(HttpStatusCode.Unauthorized, dashboard.StatusCode);
    }

    [Fact]
    public async Task Login_WithValidCsrfButWrongPassword_IsUnauthorized()
    {
        using var client = CreateClient();
        var csrf = await GetCsrfAsync(client);
        using var response = await PostAsync(client, "/api/auth/login",
            new { email = CookieAuthenticationApiFactory.Email, password = "incorrect" }, csrf);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(HasCookie(response, AuthCookieName));
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("invalid")]
    [InlineData("expired")]
    public async Task Dashboard_WithoutValidJwtCookie_IsUnauthorized(string cookieCase)
    {
        using var client = CreateClient(handleCookies: false);
        if (cookieCase != "missing")
        {
            var token = cookieCase == "expired" ? _factory.CreateExpiredJwt() : "invalid-jwt";
            client.DefaultRequestHeaders.Add("Cookie", $"{AuthCookieName}={token}");
        }

        using var response = await client.GetAsync("/api/dashboard");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Dashboard_WithInvalidAuthorizationHeader_DoesNotFallBackToCookie()
    {
        using var client = CreateClient();
        using var login = await LoginAsync(client);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", "invalid-jwt");

        using var response = await client.GetAsync("/api/dashboard");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("invalid")]
    [InlineData("another-session")]
    public async Task Payment_WithCookieButWithoutMatchingCsrf_IsRejected(string csrfCase)
    {
        using var client = CreateClient();
        using var login = await LoginAsync(client);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var csrf = await GetRejectedCsrfAsync(client, csrfCase);

        using var response = await PostAsync(client, "/api/payments", PaymentRequest(), csrf);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Payment_WithCookieAndValidCsrf_IsCreated()
    {
        using var client = CreateClient();
        using var login = await LoginAsync(client);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var csrf = await GetCsrfAsync(client);

        using var response = await PostAsync(client, "/api/payments", PaymentRequest(), csrf);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Payment_WithCookieAndBearerHeader_StillRequiresCsrf()
    {
        using var client = CreateClient();
        using var login = await LoginAsync(client);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var scope = _factory.Services.CreateScope();
        var jwt = scope.ServiceProvider.GetRequiredService<JwtTokenService>().GenerateToken(
            1, 1, CookieAuthenticationApiFactory.Email, "initiator", "Cookie test user");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", jwt);

        using var response = await PostAsync(client, "/api/payments", PaymentRequest(), null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("invalid")]
    [InlineData("another-session")]
    public async Task Logout_WithoutMatchingCsrf_IsRejectedAndKeepsSession(string csrfCase)
    {
        using var client = CreateClient();
        using var login = await LoginAsync(client);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var csrf = await GetRejectedCsrfAsync(client, csrfCase);

        using var response = await PostAsync(client, "/api/auth/logout", new { }, csrf);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(HasCookie(response, AuthCookieName));
        using var dashboard = await client.GetAsync("/api/dashboard");
        Assert.Equal(HttpStatusCode.OK, dashboard.StatusCode);
    }

    [Fact]
    public async Task Logout_WithValidCsrf_DeletesCookieAndEndsBrowserSession()
    {
        using var client = CreateClient();
        using var login = await LoginAsync(client);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var csrf = await GetCsrfAsync(client);

        using var response = await PostAsync(client, "/api/auth/logout", new { }, csrf);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var cookie = GetCookie(response, AuthCookieName);
        Assert.Equal("/api", cookie.Path.ToString());
        Assert.True(cookie.Expires < DateTimeOffset.UtcNow);
        using var dashboard = await client.GetAsync("/api/dashboard");
        Assert.Equal(HttpStatusCode.Unauthorized, dashboard.StatusCode);
    }

    [Theory]
    [InlineData("http://localhost:5173", true)]
    [InlineData("https://untrusted.example", false)]
    public async Task Cors_OnlyAllowsConfiguredFrontendWithCredentials(string origin, bool allowed)
    {
        using var client = CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/auth/login");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type,x-csrf-token");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Origin"));
        if (allowed)
        {
            Assert.Equal(origin, Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
            Assert.Equal("true", Assert.Single(response.Headers.GetValues("Access-Control-Allow-Credentials")));
        }
        else
        {
            Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
        }
    }

    [Theory]
    [InlineData("http", false)]
    [InlineData("https", true)]
    public async Task LocalHttpOptIn_StillUsesSecureCookiesOnHttps(string scheme, bool secure)
    {
        using var localFactory = _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("Auth:AllowInsecureCookies", "true"));
        using var client = localFactory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"{scheme}://localhost"),
            AllowAutoRedirect = false
        });

        using var csrfResponse = await client.GetAsync("/api/auth/csrf");
        Assert.Equal(HttpStatusCode.OK, csrfResponse.StatusCode);
        Assert.Equal(secure, GetCookie(csrfResponse, CsrfCookieName).Secure);
        using var csrfBody = await ReadJsonAsync(csrfResponse);
        var csrf = csrfBody.RootElement.GetProperty("requestToken").GetString();
        using var login = await PostAsync(client, "/api/auth/login", Credentials(), csrf);

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Equal(secure, GetCookie(login, AuthCookieName).Secure);
    }

    [Theory]
    [InlineData("192.0.2.10", 200)]
    [InlineData("192.0.2.11", 500)]
    public async Task ForwardedHttps_OnlyAllowsSecureCookieSetupThroughTrustedProxy(
        string remoteAddress, int expectedStatus)
    {
        using var proxyFactory = _factory.WithWebHostBuilder(builder =>
            builder.UseSetting("ReverseProxy:KnownProxies:0", "192.0.2.10"));

        var context = await proxyFactory.Server.SendAsync(context =>
        {
            context.Connection.RemoteIpAddress = IPAddress.Parse(remoteAddress);
            context.Request.Method = "GET";
            context.Request.Path = "/api/auth/csrf";
            context.Request.Scheme = "http";
            context.Request.Headers["X-Forwarded-Proto"] = "https";
        });

        Assert.Equal(expectedStatus, context.Response.StatusCode);
        if (expectedStatus == 200)
        {
            var cookie = Assert.Single(SetCookieHeaderValue.ParseList(
                context.Response.Headers.SetCookie.OfType<string>().ToList()), value => value.Name == CsrfCookieName);
            Assert.True(cookie.Secure);
        }
        else
        {
            // Antiforgery refuses HTTP while secure cookies are required.
            Assert.False(context.Response.Headers.ContainsKey("Set-Cookie"));
        }
    }

    private HttpClient CreateClient(bool handleCookies = true) =>
        _factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
            HandleCookies = handleCookies
        });

    private object Credentials() =>
        new { email = CookieAuthenticationApiFactory.Email, password = _factory.Password };

    private static object PaymentRequest() => new
    {
        fromAccountId = 1,
        toIban = "SE4550000000054910000099",
        amount = 125.50m,
        reference = "Cookie authentication test"
    };

    private async Task<HttpResponseMessage> LoginAsync(HttpClient client) =>
        await PostAsync(client, "/api/auth/login", Credentials(), await GetCsrfAsync(client));

    private async Task<string?> GetRejectedCsrfAsync(HttpClient client, string csrfCase)
    {
        await GetCsrfAsync(client);
        if (csrfCase == "missing") return null;
        if (csrfCase == "invalid") return "invalid-csrf-token";
        using var otherClient = CreateClient();
        return await GetCsrfAsync(otherClient);
    }

    private static async Task<string> GetCsrfAsync(HttpClient client)
    {
        using var response = await client.GetAsync("/api/auth/csrf");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = await ReadJsonAsync(response);
        return body.RootElement.GetProperty("requestToken").GetString()!;
    }

    private static async Task<HttpResponseMessage> PostAsync(
        HttpClient client, string path, object body, string? csrf)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(body)
        };
        if (csrf is not null) request.Headers.Add(CsrfHeaderName, csrf);
        return await client.SendAsync(request);
    }

    private static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync());

    private static bool HasCookie(HttpResponseMessage response, string name) =>
        response.Headers.TryGetValues("Set-Cookie", out var values) &&
        SetCookieHeaderValue.ParseList(values.ToList()).Any(cookie => cookie.Name == name);

    private static SetCookieHeaderValue GetCookie(HttpResponseMessage response, string name) =>
        Assert.Single(SetCookieHeaderValue.ParseList(response.Headers.GetValues("Set-Cookie").ToList()),
            cookie => cookie.Name == name);
}

/// <summary>Each fixture uses an isolated database and randomly generated test credentials.</summary>
public sealed class CookieAuthenticationApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string Email = "cookie-test@example.invalid";
    private readonly string _databaseName = $"CookieAuthentication-{Guid.NewGuid()}";
    private readonly string _signingKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    public string Password { get; } = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Jwt:Key", _signingKey);
        builder.UseSetting("Jwt:Issuer", "CookieAuthenticationTests");
        builder.UseSetting("Jwt:Audience", "CookieAuthenticationTests");
        builder.UseSetting("Auth:AllowInsecureCookies", "false");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<SebDbContext>();
            services.RemoveAll<DbContextOptions<SebDbContext>>();
            services.AddDbContext<SebDbContext>(options => options.UseInMemoryDatabase(_databaseName));
        });
    }

    public async Task InitializeAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        db.Tenants.Add(new Tenant { Id = 1, Name = "Cookie test tenant" });
        db.Users.Add(new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Cookie test user",
            Email = Email,
            Role = "initiator",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(Password, workFactor: 4)
        });
        db.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Cookie test account",
            Iban = "SE3550000000054910000003",
            Balance = 1000m,
            Currency = "SEK"
        });
        await db.SaveChangesAsync();
    }

    public string CreateExpiredJwt()
    {
        var token = new JwtSecurityToken(
            issuer: "CookieAuthenticationTests",
            audience: "CookieAuthenticationTests",
            claims: new[] { new Claim("sub", "1"), new Claim("tenantId", "1") },
            notBefore: DateTime.UtcNow.AddHours(-3),
            expires: DateTime.UtcNow.AddHours(-1),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_signingKey)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    Task IAsyncLifetime.DisposeAsync() => DisposeAsync().AsTask();
}
