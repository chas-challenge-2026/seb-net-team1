using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>
/// Verifies that concurrent payments cannot spend the same account balance.
/// </summary>
public sealed class ConcurrentPaymentsIntegrationTests
    : IClassFixture<PostgreSqlFixture>
{
    private readonly PostgreSqlFixture _postgres;

    public ConcurrentPaymentsIntegrationTests(
        PostgreSqlFixture postgres)
    {
        _postgres = postgres;
    }

    [Fact]
    public async Task PostgreSqlTestDatabase_CanBeCreated()
    {
        using var factory =
            new PostgreSqlPaymentApiFactory(
                _postgres.ConnectionString);

        using var scope = factory.Services.CreateScope();

        var db = scope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        await db.Database.EnsureCreatedAsync();

        var canConnect =
            await db.Database.CanConnectAsync();

        Assert.True(canConnect);
    }

    [Fact]
    public async Task CreatePayments_Concurrently_WhenBalanceCoversOnlyOne_OnlyOneSucceeds()
    {
        using var factory =
            new PostgreSqlPaymentApiFactory(
                _postgres.ConnectionString);

        using var scope = factory.Services.CreateScope();

        var db = scope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        await db.Database.EnsureCreatedAsync();

        db.Tenants.Add(new Tenant
        {
            Id = 1,
            Name = "Testföretaget"
        });

        db.Users.Add(new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Test User",
            Email = "test@example.com",
            Role = UserRoles.Initiator
        });

        db.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Testkonto",
            Iban = "SE3550000000054910000003",
            Balance = 1000m,
            Currency = "SEK"
        });

        await db.SaveChangesAsync();

        var savedBalance = await db.Accounts
            .AsNoTracking()
            .Where(account => account.Id == 1)
            .Select(account => account.Balance)
            .SingleAsync();

        Assert.Equal(1000m, savedBalance);

        var tokenService = scope.ServiceProvider
            .GetRequiredService<JwtTokenService>();

        var token = tokenService.GenerateToken(
            userId: 1,
            tenantId: 1,
            email: "test@example.com",
            role: UserRoles.Initiator,
            name: "Test User");

        using var firstClient = factory.CreateClient();
        using var secondClient = factory.CreateClient();

        firstClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        secondClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        var firstRequest = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "SE4550000000054910000099",
            Amount = 800m,
            Reference = "Concurrent payment A"
        };

        var secondRequest = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "SE4550000000054910000099",
            Amount = 800m,
            Reference = "Concurrent payment B"
        };

        var responses = await Task.WhenAll(
            firstClient.PostAsJsonAsync(
                "/api/payments",
                firstRequest),
            secondClient.PostAsJsonAsync(
                "/api/payments",
                secondRequest));

        Assert.Single(
            responses,
            response =>
                response.StatusCode == HttpStatusCode.Created);

        var failedResponse = Assert.Single(
            responses,
            response =>
                response.StatusCode != HttpStatusCode.Created);

        Assert.True(
            failedResponse.StatusCode is
                HttpStatusCode.Conflict or
                HttpStatusCode.BadRequest);

        using var verificationScope =
            factory.Services.CreateScope();

        var verificationDb = verificationScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        var accountAfterPayments = await verificationDb.Accounts
            .AsNoTracking()
            .SingleAsync(account => account.Id == 1);

        var savedPayments = await verificationDb.Payments
            .AsNoTracking()
            .ToListAsync();

        var savedTransactions = await verificationDb.Transactions
            .AsNoTracking()
            .ToListAsync();

        Assert.Equal(200m, accountAfterPayments.Balance);

        var savedPayment = Assert.Single(savedPayments);
        Assert.Equal(
            PaymentStatuses.Completed,
            savedPayment.Status);

        var savedTransaction =
            Assert.Single(savedTransactions);

        Assert.Equal(-800m, savedTransaction.Amount);
        Assert.Equal(1, savedTransaction.AccountId);
    }
}
