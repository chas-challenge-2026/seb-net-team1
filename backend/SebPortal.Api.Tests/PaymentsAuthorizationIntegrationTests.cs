using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using SebPortal.Api.DTOs;
using System.Net.Http.Headers;
using Microsoft.Extensions.DependencyInjection;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>
/// Verifies payment authorization through the complete HTTP and JWT pipeline.
/// </summary>
public class PaymentsAuthorizationIntegrationTests
    : IClassFixture<PaymentApiFactory>
{
    private readonly PaymentApiFactory _factory;
    private readonly HttpClient _client;

    public PaymentsAuthorizationIntegrationTests(
        PaymentApiFactory factory)
    {
        _factory = factory;

        _client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });
    }

    /// <summary>
    /// Verifies that the payment endpoint rejects requests without a JWT.
    /// </summary>
    [Fact]
    public async Task CreatePayment_WithoutToken_ReturnsUnauthorized()
    {
        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "SE4550000000054910000099",
            Amount = 125.50m,
            Reference = "Integration test"
        };

        var response = await _client.PostAsJsonAsync("/api/payments", request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
    /// <summary>
    /// Verifies that a valid JWT allows an authenticated user to create a payment.
    /// </summary>
    [Fact]
    public async Task CreatePayment_WithValidToken_ReturnsCreated()
    {
        using var scope = _factory.Services.CreateScope();

        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();

        db.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Företagskonto",
            Iban = "SE3550000000054910000003",
            Balance = 1000m,
            Currency = "SEK"
        });

        await db.SaveChangesAsync();

        var tokenService = scope.ServiceProvider
            .GetRequiredService<JwtTokenService>();

        var token = tokenService.GenerateToken(
            userId: 1,
            tenantId: 1,
            email: "lisa@malmobygg.se",
            role: "initiator",
            name: "Lisa Persson");

        _client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "SE4550000000054910000099",
            Amount = 125.50m,
            Reference = "Integration test"
        };

        var response = await _client.PostAsJsonAsync("/api/payments", request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }
}