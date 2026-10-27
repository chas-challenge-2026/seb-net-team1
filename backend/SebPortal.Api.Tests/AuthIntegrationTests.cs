using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>
/// Login, refresh token rotation, reuse detection, logout and brute force limits.
/// </summary>
public class AuthIntegrationTests
{
    private static async Task<HttpResponseMessage> LoginAsync(HttpClient client, string email, string password = PortalApiFactory.Password) =>
        await client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = password });

    private static string? RefreshCookie(HttpResponseMessage response) =>
        response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.FirstOrDefault(v => v.StartsWith("seb_refresh=", StringComparison.Ordinal))
            : null;

    [Fact]
    public async Task Login_ReturnsAShortLivedTokenAndAnHttpOnlyRefreshCookie()
    {
        await using var factory = new PortalApiFactory();
        await factory.SeedAsync();
        var client = factory.CreateBrowserClient();

        var response = await LoginAsync(client, "LISA@malmobygg.se ");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<LoginResponse>())!;
        Assert.False(string.IsNullOrWhiteSpace(body.AccessToken));
        Assert.InRange(body.ExpiresAt, DateTime.UtcNow.AddMinutes(10), DateTime.UtcNow.AddMinutes(16));
        Assert.Equal("Malmö Bygg AB", body.User!.TenantName);

        var cookie = RefreshCookie(response)!.ToLowerInvariant();
        Assert.Contains("httponly", cookie);
        Assert.Contains("secure", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("path=/api/auth", cookie);

        Assert.Equal(1, await factory.WithDbAsync(db => db.AuditEntries.CountAsync(e => e.Action == AuditActions.Login)));
    }

    [Theory]
    [InlineData("lisa@malmobygg.se", "fel-lösenord")]
    [InlineData("finns.inte@malmobygg.se", "password123")]
    [InlineData("' OR '1'='1' --", "x")] // BUG-001
    public async Task Login_WithBadCredentials_Returns401WithoutRevealingWhy(string email, string password)
    {
        await using var factory = new PortalApiFactory();
        await factory.SeedAsync();

        var response = await LoginAsync(factory.CreateBrowserClient(), email, password);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Equal("Fel e-post eller lösenord.", problem!.Detail);
    }

    [Fact]
    public async Task Refresh_RotatesTheToken_AndDetectsReuse()
    {
        await using var factory = new PortalApiFactory();
        await factory.SeedAsync();
        var client = factory.CreateBrowserClient();
        var login = await LoginAsync(client, "lisa@malmobygg.se");
        var originalCookie = RefreshCookie(login)!.Split(';')[0];

        // The browser's cookie jar sends the current refresh token.
        var refreshed = await client.PostAsync("/api/auth/refresh", null);
        Assert.Equal(HttpStatusCode.OK, refreshed.StatusCode);
        var rotatedCookie = RefreshCookie(refreshed)!.Split(';')[0];
        Assert.NotEqual(originalCookie, rotatedCookie);

        var me = new HttpRequestMessage(HttpMethod.Get, "/api/auth/me");
        me.Headers.Authorization = new AuthenticationHeaderValue("Bearer",
            (await refreshed.Content.ReadFromJsonAsync<LoginResponse>())!.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(me)).StatusCode);

        // An attacker replays the old (already used) token: rejected, and the whole
        // family is revoked, so the legitimate new token stops working too.
        var attacker = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost"), HandleCookies = false });
        var replay = new HttpRequestMessage(HttpMethod.Post, "/api/auth/refresh");
        replay.Headers.Add("Cookie", originalCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, (await attacker.SendAsync(replay)).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/auth/refresh", null)).StatusCode);
    }

    [Fact]
    public async Task Logout_RevokesTheRefreshToken()
    {
        await using var factory = new PortalApiFactory();
        await factory.SeedAsync();
        var client = factory.CreateBrowserClient();
        await LoginAsync(client, "lisa@malmobygg.se");

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsync("/api/auth/refresh", null)).StatusCode);
        Assert.Equal(0, await factory.WithDbAsync(db => db.RefreshTokens.CountAsync(t => t.RevokedAt == null)));
    }

    [Fact]
    public async Task DeactivatedUser_CannotLogIn()
    {
        await using var factory = new PortalApiFactory();
        await factory.SeedAsync();
        await factory.WithDbAsync(async db =>
        {
            var lisa = await db.Users.SingleAsync(u => u.Email == "lisa@malmobygg.se");
            lisa.IsActive = false;
            return await db.SaveChangesAsync();
        });

        var response = await LoginAsync(factory.CreateBrowserClient(), "lisa@malmobygg.se");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithoutToken_Returns401ProblemDetails()
    {
        await using var factory = new PortalApiFactory();

        var response = await factory.CreateBrowserClient().GetAsync("/api/dashboard");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Equal("Åtkomst nekad. Logga in igen.", problem!.Detail);
    }

    [Fact]
    public async Task ChangePassword_RequiresTheCurrentPassword()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");

        var wrong = await lisa.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = "fel", newPassword = "ett-nytt-losenord" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);

        var ok = await lisa.PostAsJsonAsync("/api/auth/change-password", new { currentPassword = PortalApiFactory.Password, newPassword = "ett-nytt-losenord" });
        Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);

        var login = await LoginAsync(factory.CreateBrowserClient(), "lisa@malmobygg.se", "ett-nytt-losenord");
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Login_IsRateLimited()
    {
        await using var factory = new PortalApiFactory { LoginRateLimit = 3 };
        await factory.SeedAsync();
        var client = factory.CreateBrowserClient();

        for (var i = 0; i < 3; i++)
        {
            await LoginAsync(client, "lisa@malmobygg.se", "fel");
        }
        var blocked = await LoginAsync(client, "lisa@malmobygg.se");

        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
        var problem = await blocked.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Contains("För många", problem!.Detail);
    }
}
