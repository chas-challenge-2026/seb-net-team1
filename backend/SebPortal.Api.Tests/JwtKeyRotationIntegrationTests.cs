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
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Microsoft.Net.Http.Headers;

namespace SebPortal.Api.Tests;

/// <summary>
/// Verifies key rotation across API restarts while existing browser sessions remain valid.
/// </summary>
public class JwtKeyRotationIntegrationTests : IClassFixture<CookieAuthenticationApiFactory>
{
    private const string Issuer = "CookieAuthenticationTests";
    private const string Audience = "CookieAuthenticationTests";
    private readonly CookieAuthenticationApiFactory _factory;
    private readonly string _oldKey = RandomKey();
    private readonly string _newKey = RandomKey();
    private readonly string _foreignKey = RandomKey();

    public JwtKeyRotationIntegrationTests(CookieAuthenticationApiFactory factory)
    {
        _factory = factory;
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Rotation_KeepsOldTokensDuringOverlap_AndRejectsThemAfterRemoval(bool useCookie)
    {
        using var originalApi = CreatePhase(_oldKey);
        var originalToken = await LoginAndReadTokenAsync(originalApi);
        var legacyOldToken = CreateToken(_oldKey, includeKeyId: false);
        await AssertDashboardAsync(originalApi, originalToken, useCookie, HttpStatusCode.OK);
        await AssertDashboardAsync(originalApi, legacyOldToken, useCookie, HttpStatusCode.OK);

        using var overlapApi = CreatePhase(_newKey, _oldKey);
        var newToken = await LoginAndReadTokenAsync(overlapApi);
        var legacyNewToken = CreateToken(_newKey, includeKeyId: false);
        var parsedNewToken = new JwtSecurityTokenHandler().ReadJwtToken(newToken);

        Assert.Equal(KeyId(_newKey), parsedNewToken.Header.Kid);
        Assert.True(HasValidSignature(newToken, _newKey));
        Assert.False(HasValidSignature(newToken, _oldKey));
        await AssertDashboardAsync(overlapApi, originalToken, useCookie, HttpStatusCode.OK);
        await AssertDashboardAsync(overlapApi, legacyOldToken, useCookie, HttpStatusCode.OK);
        await AssertDashboardAsync(overlapApi, newToken, useCookie, HttpStatusCode.OK);
        await AssertDashboardAsync(overlapApi, legacyNewToken, useCookie, HttpStatusCode.OK);

        using var retiredApi = CreatePhase(_newKey);
        // These tokens have not expired: rejection must result from removing their signing key.
        Assert.True(new JwtSecurityTokenHandler().ReadJwtToken(originalToken).ValidTo > DateTime.UtcNow);
        await AssertDashboardAsync(retiredApi, originalToken, useCookie, HttpStatusCode.Unauthorized);
        await AssertDashboardAsync(retiredApi, legacyOldToken, useCookie, HttpStatusCode.Unauthorized);
        await AssertDashboardAsync(retiredApi, newToken, useCookie, HttpStatusCode.OK);
        await AssertDashboardAsync(retiredApi, legacyNewToken, useCookie, HttpStatusCode.OK);
        await AssertDashboardAsync(originalApi, newToken, useCookie, HttpStatusCode.Unauthorized);
    }

    public static IEnumerable<object[]> InvalidTokenCases()
    {
        string[] cases =
        [
            "expired-previous", "expired-active", "foreign-key-with-known-id", "unknown-key-id",
            "foreign-key-without-id", "wrong-issuer", "wrong-audience", "wrong-algorithm", "unsigned"
        ];
        foreach (var invalidCase in cases)
        {
            yield return [invalidCase, false];
            yield return [invalidCase, true];
        }
    }

    [Theory]
    [MemberData(nameof(InvalidTokenCases))]
    public async Task Rotation_RejectsInvalidTokensDuringOverlap(string invalidCase, bool useCookie)
    {
        using var api = CreatePhase(_newKey, _oldKey);
        var token = invalidCase switch
        {
            "expired-previous" => CreateToken(_oldKey, expires: DateTime.UtcNow.AddMinutes(-1)),
            "expired-active" => CreateToken(_newKey, expires: DateTime.UtcNow.AddMinutes(-1)),
            "foreign-key-with-known-id" => CreateToken(_foreignKey, keyIdOverride: KeyId(_newKey)),
            "unknown-key-id" => CreateToken(_newKey, keyIdOverride: "unknown-signing-key"),
            "foreign-key-without-id" => CreateToken(_foreignKey, includeKeyId: false),
            "wrong-issuer" => CreateToken(_newKey, issuer: "UntrustedIssuer"),
            "wrong-audience" => CreateToken(_oldKey, audience: "UntrustedAudience"),
            "wrong-algorithm" => CreateToken(_newKey, algorithm: SecurityAlgorithms.HmacSha384),
            "unsigned" => CreateToken(_newKey, algorithm: SecurityAlgorithms.None),
            _ => throw new ArgumentOutOfRangeException(nameof(invalidCase))
        };

        await AssertDashboardAsync(api, token, useCookie, HttpStatusCode.Unauthorized);
        await AssertDashboardAsync(api, CreateToken(_newKey), useCookie, HttpStatusCode.OK);
    }

    [Fact]
    public async Task RuntimeConfigurationChanges_DoNotMixSigningAndValidationKeysBeforeRestart()
    {
        using var api = CreatePhase(_oldKey);
        var beforeChange = await LoginAndReadTokenAsync(api);
        var configuration = api.Services.GetRequiredService<IConfiguration>();

        configuration["Jwt:Key"] = _newKey;
        configuration["Jwt:PreviousKey"] = _foreignKey;
        configuration["Jwt:Issuer"] = "ChangedIssuer";
        configuration["Jwt:Audience"] = "ChangedAudience";

        var afterChange = await LoginAndReadTokenAsync(api);
        var parsed = new JwtSecurityTokenHandler().ReadJwtToken(afterChange);
        Assert.Equal(KeyId(_oldKey), parsed.Header.Kid);
        Assert.Equal(Issuer, parsed.Issuer);
        Assert.Contains(Audience, parsed.Audiences);
        Assert.True(HasValidSignature(afterChange, _oldKey));
        Assert.False(HasValidSignature(afterChange, _newKey));
        await AssertDashboardAsync(api, beforeChange, useCookie: true, HttpStatusCode.OK);
        await AssertDashboardAsync(api, afterChange, useCookie: true, HttpStatusCode.OK);
        await AssertDashboardAsync(api, CreateToken(_newKey), useCookie: true, HttpStatusCode.Unauthorized);
        await AssertDashboardAsync(api, CreateToken(_foreignKey), useCookie: true, HttpStatusCode.Unauthorized);
    }

    private WebApplicationFactory<Program> CreatePhase(string activeKey, string? previousKey = null) =>
        _factory.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("Jwt:Key", activeKey);
            builder.UseSetting("Jwt:PreviousKey", previousKey ?? "");
        });

    private async Task<string> LoginAndReadTokenAsync(WebApplicationFactory<Program> api)
    {
        using var client = CreateClient(api, handleCookies: true);
        using var csrfResponse = await client.GetAsync("/api/auth/csrf");
        Assert.Equal(HttpStatusCode.OK, csrfResponse.StatusCode);
        using var csrfBody = JsonDocument.Parse(await csrfResponse.Content.ReadAsStringAsync());
        var csrf = csrfBody.RootElement.GetProperty("requestToken").GetString();
        using var loginRequest = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
        {
            Content = JsonContent.Create(new
            {
                email = CookieAuthenticationApiFactory.Email,
                password = _factory.Password
            })
        };
        loginRequest.Headers.Add("X-CSRF-TOKEN", csrf);
        using var response = await client.SendAsync(loginRequest);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cookie = Assert.Single(
            SetCookieHeaderValue.ParseList(response.Headers.GetValues("Set-Cookie").ToList()),
            cookie => cookie.Name == "SebPortal.Auth");
        return cookie.Value.ToString();
    }

    private static async Task AssertDashboardAsync(
        WebApplicationFactory<Program> api, string token, bool useCookie, HttpStatusCode expectedStatus)
    {
        using var client = CreateClient(api, handleCookies: false);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/dashboard");
        if (useCookie)
            request.Headers.Add("Cookie", $"SebPortal.Auth={token}");
        else
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var response = await client.SendAsync(request);
        Assert.Equal(expectedStatus, response.StatusCode);
    }

    private static HttpClient CreateClient(WebApplicationFactory<Program> api, bool handleCookies) =>
        api.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = handleCookies,
            AllowAutoRedirect = false
        });

    private static string CreateToken(
        string key,
        bool includeKeyId = true,
        DateTime? expires = null,
        string? keyIdOverride = null,
        string issuer = Issuer,
        string audience = Audience,
        string algorithm = SecurityAlgorithms.HmacSha256)
    {
        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        if (includeKeyId) signingKey.KeyId = keyIdOverride ?? KeyId(key);
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: [new Claim("sub", "1"), new Claim("tenantId", "1")],
            notBefore: DateTime.UtcNow.AddHours(-3),
            expires: expires ?? DateTime.UtcNow.AddHours(2),
            signingCredentials: algorithm == SecurityAlgorithms.None
                ? null
                : new SigningCredentials(signingKey, algorithm));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static bool HasValidSignature(string token, string key)
    {
        try
        {
            new JwtSecurityTokenHandler().ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
                ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                ValidateIssuer = true,
                ValidIssuer = Issuer,
                ValidateAudience = true,
                ValidAudience = Audience,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            }, out _);
            return true;
        }
        catch (SecurityTokenException)
        {
            return false;
        }
    }

    private static string KeyId(string key) =>
        Base64UrlEncoder.Encode(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    // Long enough for the deliberately wrong HS384 algorithm case as well as HS256.
    private static string RandomKey() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(64));
}
