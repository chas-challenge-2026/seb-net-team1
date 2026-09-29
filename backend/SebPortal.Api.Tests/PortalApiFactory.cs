using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Services;

namespace SebPortal.Api.Tests;

/// <summary>
/// The whole API over HTTP with an in-memory database seeded with a small tenant:
/// Lisa (initiator), Johan and Erik (attestants), Sara (admin), all with the
/// password "password123", and one account with 1 000 000 SEK.
/// </summary>
public class PortalApiFactory : WebApplicationFactory<Program>
{
    public const string Password = "password123";
    public const int TenantId = 1;
    public const int LisaId = 1, JohanId = 2, SaraId = 3, ErikId = 4;
    public const int AccountId = 1;
    public const string AccountIban = "SE4550000000058398257466";
    public const string RecipientIban = "SE3550000000054910000003";

    private readonly string _databaseName = $"PortalApiTests-{Guid.NewGuid()}";

    public int LoginRateLimit { get; init; } = 1000;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("RateLimiting:LoginPerMinute", LoginRateLimit.ToString());
        builder.UseSetting("Smtp:Host", "");

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<SebDbContext>();
            services.RemoveAll<DbContextOptions<SebDbContext>>();
            services.AddDbContext<SebDbContext>(options => options.UseInMemoryDatabase(_databaseName));
            services.RemoveAll<IHostedService>();
        });
    }

    public async Task SeedAsync()
    {
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        if (await db.Tenants.AnyAsync())
        {
            return;
        }

        var hasher = new PasswordHasher();
        db.Tenants.Add(new Tenant { Id = TenantId, Name = "Malmö Bygg AB" });
        db.Users.AddRange(
            new User { Id = LisaId, TenantId = TenantId, Name = "Lisa Persson", Email = "lisa@malmobygg.se", Role = UserRoles.Initiator, PasswordHash = hasher.HashPassword(Password) },
            new User { Id = JohanId, TenantId = TenantId, Name = "Johan Berg", Email = "johan@malmobygg.se", Role = UserRoles.Attestant, PasswordHash = hasher.HashPassword(Password) },
            new User { Id = SaraId, TenantId = TenantId, Name = "Sara Ek", Email = "sara@malmobygg.se", Role = UserRoles.Admin, PasswordHash = hasher.HashPassword(Password) },
            new User { Id = ErikId, TenantId = TenantId, Name = "Erik Lind", Email = "erik@malmobygg.se", Role = UserRoles.Attestant, PasswordHash = hasher.HashPassword(Password) });
        db.Accounts.Add(new Account { Id = AccountId, TenantId = TenantId, AccountName = "Driftkonto", Iban = AccountIban, Balance = 1_000_000m });
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// A client on https (the refresh cookie is Secure) with its own cookie jar.
    /// </summary>
    public HttpClient CreateBrowserClient() =>
        CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            AllowAutoRedirect = false,
            HandleCookies = true
        });

    public async Task<HttpClient> LoginAsync(string email)
    {
        await SeedAsync();
        var client = CreateBrowserClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new LoginRequest { Email = email, Password = Password });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body!.AccessToken);
        return client;
    }

    public async Task<T> WithDbAsync<T>(Func<SebDbContext, Task<T>> query)
    {
        using var scope = Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<SebDbContext>());
    }
}
