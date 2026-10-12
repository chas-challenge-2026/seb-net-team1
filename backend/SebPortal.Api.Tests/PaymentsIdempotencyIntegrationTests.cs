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
/// Verifies that retrying the same payment request does not create duplicates.
/// </summary>
public sealed class PaymentsIdempotencyIntegrationTests
    : IClassFixture<PostgreSqlFixture>
{

    private readonly PostgreSqlFixture _postgres;

    public PaymentsIdempotencyIntegrationTests(
            PostgreSqlFixture postgres)
    {
        _postgres = postgres;
    }

    [Fact]
    public async Task CreatePayment_TwiceWithSameKeyAndRequest_CreatesOnlyOnePayment()
    {
        using var factory =
            new PostgreSqlPaymentApiFactory(
                _postgres.ConnectionString);

        using var setupScope = factory.Services.CreateScope();

        var setupDb = setupScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        await setupDb.Database.EnsureCreatedAsync();

        setupDb.Tenants.Add(new Tenant
        {
            Id = 1,
            Name = "Testföretaget"
        });

        setupDb.Users.Add(new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Test User",
            Email = "test@example.com",
            Role = UserRoles.Initiator
        });

        setupDb.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Testkonto",
            Iban = "SE3550000000054910000003",
            Balance = 1000m,
            Currency = "SEK"
        });

        await setupDb.SaveChangesAsync();

        var token = setupScope.ServiceProvider
            .GetRequiredService<JwtTokenService>()
            .GenerateToken(
                userId: 1,
                tenantId: 1,
                email: "test@example.com",
                role: UserRoles.Initiator,
                name: "Test User");

        using var client = factory.CreateClient();

        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        client.DefaultRequestHeaders.Add(
            "Idempotency-Key",
            "payment-request-001");

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "SE4550000000054910000099",
            Amount = 100m,
            Reference = "Idempotency test"
        };

        var firstResponse = await client.PostAsJsonAsync(
            "/api/payments",
            request);

        var secondResponse = await client.PostAsJsonAsync(
            "/api/payments",
            request);

        Assert.Equal(
            HttpStatusCode.Created,
            firstResponse.StatusCode);

        Assert.True(secondResponse.IsSuccessStatusCode);

        var firstPayment =
            await firstResponse.Content
                .ReadFromJsonAsync<PaymentResponseDto>();

        var secondPayment =
            await secondResponse.Content
                .ReadFromJsonAsync<PaymentResponseDto>();

        Assert.NotNull(firstPayment);
        Assert.NotNull(secondPayment);
        Assert.Equal(firstPayment.Id, secondPayment.Id);

        using var verificationScope =
            factory.Services.CreateScope();

        var verificationDb = verificationScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        Assert.Single(
            await verificationDb.Payments
                .AsNoTracking()
                .Where(payment => payment.TenantId == 1)
                .ToListAsync());

        Assert.Single(
            await verificationDb.Transactions
                .AsNoTracking()
                .Where(transaction => transaction.AccountId == 1)
                .ToListAsync());

        Assert.Single(
            await verificationDb.AuditEntries
                .AsNoTracking()
                .Where(entry => entry.TenantId == 1)
                .ToListAsync());

        var account = await verificationDb.Accounts
            .AsNoTracking()
            .SingleAsync(account => account.Id == 1);

        Assert.Equal(900m, account.Balance);
    }

    [Fact]
    public async Task CreatePayment_SameKeyWithDifferentRequest_ReturnsConflict()
    {
        using var factory =
            new PostgreSqlPaymentApiFactory(
                _postgres.ConnectionString);

        using var setupScope = factory.Services.CreateScope();

        var setupDb = setupScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        await setupDb.Database.EnsureCreatedAsync();

        setupDb.Tenants.Add(new Tenant
        {
            Id = 2,
            Name = "Konflikttestföretaget"
        });

        setupDb.Users.Add(new User
        {
            Id = 2,
            TenantId = 2,
            Name = "Conflict Test User",
            Email = "conflict-test@example.com",
            Role = UserRoles.Initiator
        });

        setupDb.Accounts.Add(new Account
        {
            Id = 2,
            TenantId = 2,
            AccountName = "Konflikttestkonto",
            Iban = "SE3550000000054910000004",
            Balance = 1000m,
            Currency = "SEK"
        });

        await setupDb.SaveChangesAsync();

        var token = setupScope.ServiceProvider
            .GetRequiredService<JwtTokenService>()
            .GenerateToken(
                userId: 2,
                tenantId: 2,
                email: "conflict-test@example.com",
                role: UserRoles.Initiator,
                name: "Conflict Test User");

        using var client = factory.CreateClient();

        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        client.DefaultRequestHeaders.Add(
            "Idempotency-Key",
            "payment-conflict-request-001");

        var firstRequest = new CreatePaymentRequestDto
        {
            FromAccountId = 2,
            ToIban = "SE4550000000054910000099",
            Amount = 100m,
            Reference = "Idempotency test"
        };

        var changedRequest = new CreatePaymentRequestDto
        {
            FromAccountId = 2,
            ToIban = "SE4550000000054910000099",
            Amount = 800m,
            Reference = "Idempotency test"
        };

        var firstResponse = await client.PostAsJsonAsync(
            "/api/payments",
            firstRequest);

        var secondResponse = await client.PostAsJsonAsync(
            "/api/payments",
            changedRequest);

        Assert.Equal(
            HttpStatusCode.Created,
            firstResponse.StatusCode);

        Assert.Equal(
            HttpStatusCode.Conflict,
            secondResponse.StatusCode);

        using var verificationScope =
            factory.Services.CreateScope();

        var verificationDb = verificationScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        Assert.Single(
            await verificationDb.Payments
                .AsNoTracking()
                .Where(payment => payment.TenantId == 2)
                .ToListAsync());

        Assert.Single(
            await verificationDb.Transactions
                .AsNoTracking()
                .Where(transaction => transaction.AccountId == 2)
                .ToListAsync());

        Assert.Single(
            await verificationDb.AuditEntries
                .AsNoTracking()
                .Where(entry => entry.TenantId == 2)
                .ToListAsync());

        var account = await verificationDb.Accounts
            .AsNoTracking()
            .SingleAsync(account => account.Id == 2);

        Assert.Equal(900m, account.Balance);
    }

    [Fact]
    public async Task CreatePayment_ConcurrentlyWithSameKey_CreatesOnlyOnePayment()
    {
        using var firstFactory =
            new PostgreSqlPaymentApiFactory(
                _postgres.ConnectionString);

        using var setupScope = firstFactory.Services.CreateScope();

        var setupDb = setupScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        await setupDb.Database.EnsureCreatedAsync();

        setupDb.Tenants.Add(new Tenant
        {
            Id = 3,
            Name = "Samtidighetstestföretaget"
        });

        setupDb.Users.AddRange(
            new User
            {
                Id = 3,
                TenantId = 3,
                Name = "Concurrent Test User",
                Email = "concurrent-test@example.com",
                Role = UserRoles.Initiator
            },
            new User
            {
                Id = 4,
                TenantId = 3,
                Name = "Concurrent Attestant",
                Email = "concurrent-attestant@example.com",
                Role = UserRoles.Attestant
            });

        setupDb.Accounts.Add(new Account
        {
            Id = 3,
            TenantId = 3,
            AccountName = "Samtidighetstestkonto",
            Iban = "SE3550000000054910000005",
            Balance = 100000m,
            Currency = "SEK"
        });

        await setupDb.SaveChangesAsync();

        var token = setupScope.ServiceProvider
            .GetRequiredService<JwtTokenService>()
            .GenerateToken(
                userId: 3,
                tenantId: 3,
                email: "concurrent-test@example.com",
                role: UserRoles.Initiator,
                name: "Concurrent Test User");

        using var secondFactory =
            new PostgreSqlPaymentApiFactory(
                _postgres.ConnectionString);

        using var firstClient = firstFactory.CreateClient();
        using var secondClient = secondFactory.CreateClient();

        firstClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
        secondClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        firstClient.DefaultRequestHeaders.Add(
            "Idempotency-Key",
            "concurrent-payment-request-001");
        secondClient.DefaultRequestHeaders.Add(
            "Idempotency-Key",
            "concurrent-payment-request-001");

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 3,
            ToIban = "SE4550000000054910000099",
            Amount = 60000m,
            Reference = "Concurrent idempotency test"
        };

        var responses = await Task.WhenAll(
            firstClient.PostAsJsonAsync("/api/payments", request),
            secondClient.PostAsJsonAsync("/api/payments", request));

        Assert.All(
            responses,
            response => Assert.True(response.IsSuccessStatusCode));

        var returnedPayments = await Task.WhenAll(
            responses.Select(response =>
                response.Content.ReadFromJsonAsync<PaymentResponseDto>()));

        Assert.All(returnedPayments, Assert.NotNull);
        Assert.Equal(returnedPayments[0]!.Id, returnedPayments[1]!.Id);

        using var verificationScope =
            firstFactory.Services.CreateScope();

        var verificationDb = verificationScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        var savedPayment = await verificationDb.Payments
            .AsNoTracking()
            .Include(payment => payment.ApprovalSteps)
            .SingleAsync(payment => payment.TenantId == 3);

        Assert.Single(savedPayment.ApprovalSteps);

        Assert.Single(
            await verificationDb.AuditEntries
                .AsNoTracking()
                .Where(entry => entry.TenantId == 3)
                .ToListAsync());

        Assert.Empty(
            await verificationDb.Transactions
                .AsNoTracking()
                .Where(transaction => transaction.AccountId == 3)
                .ToListAsync());

        var account = await verificationDb.Accounts
            .AsNoTracking()
            .SingleAsync(account => account.Id == 3);

        Assert.Equal(100000m, account.Balance);
    }

    [Fact]
    public async Task CreatePayment_SameKeyForDifferentUsersAndTenants_CreatesSeparatePayments()
    {
        using var factory =
            new PostgreSqlPaymentApiFactory(
                _postgres.ConnectionString);

        using var setupScope = factory.Services.CreateScope();

        var setupDb = setupScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        await setupDb.Database.EnsureCreatedAsync();

        setupDb.Tenants.AddRange(
            new Tenant { Id = 4, Name = "Scope Testföretaget A" },
            new Tenant { Id = 5, Name = "Scope Testföretaget B" });

        setupDb.Users.AddRange(
            new User
            {
                Id = 5,
                TenantId = 4,
                Name = "Scope User A",
                Email = "scope-a@example.com",
                Role = UserRoles.Initiator
            },
            new User
            {
                Id = 6,
                TenantId = 4,
                Name = "Scope User B",
                Email = "scope-b@example.com",
                Role = UserRoles.Initiator
            },
            new User
            {
                Id = 7,
                TenantId = 5,
                Name = "Scope User C",
                Email = "scope-c@example.com",
                Role = UserRoles.Initiator
            });

        setupDb.Accounts.AddRange(
            new Account
            {
                Id = 4,
                TenantId = 4,
                AccountName = "Scope Testkonto A",
                Iban = "SE3550000000054910000006",
                Balance = 1000m,
                Currency = "SEK"
            },
            new Account
            {
                Id = 5,
                TenantId = 5,
                AccountName = "Scope Testkonto B",
                Iban = "SE3550000000054910000007",
                Balance = 1000m,
                Currency = "SEK"
            });

        await setupDb.SaveChangesAsync();

        var tokenService = setupScope.ServiceProvider
            .GetRequiredService<JwtTokenService>();

        var firstToken = tokenService.GenerateToken(
            userId: 5,
            tenantId: 4,
            email: "scope-a@example.com",
            role: UserRoles.Initiator,
            name: "Scope User A");
        var secondToken = tokenService.GenerateToken(
            userId: 6,
            tenantId: 4,
            email: "scope-b@example.com",
            role: UserRoles.Initiator,
            name: "Scope User B");
        var thirdToken = tokenService.GenerateToken(
            userId: 7,
            tenantId: 5,
            email: "scope-c@example.com",
            role: UserRoles.Initiator,
            name: "Scope User C");

        using var firstClient = factory.CreateClient();
        using var secondClient = factory.CreateClient();
        using var thirdClient = factory.CreateClient();

        ConfigureClient(firstClient, firstToken, "shared-scope-key");
        ConfigureClient(secondClient, secondToken, "shared-scope-key");
        ConfigureClient(thirdClient, thirdToken, "shared-scope-key");

        var firstResponse = await firstClient.PostAsJsonAsync(
            "/api/payments",
            CreateRequest(fromAccountId: 4));
        var secondResponse = await secondClient.PostAsJsonAsync(
            "/api/payments",
            CreateRequest(fromAccountId: 4));
        var thirdResponse = await thirdClient.PostAsJsonAsync(
            "/api/payments",
            CreateRequest(fromAccountId: 5));

        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, secondResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, thirdResponse.StatusCode);

        var returnedPayments = await Task.WhenAll(
            firstResponse.Content.ReadFromJsonAsync<PaymentResponseDto>(),
            secondResponse.Content.ReadFromJsonAsync<PaymentResponseDto>(),
            thirdResponse.Content.ReadFromJsonAsync<PaymentResponseDto>());

        Assert.All(returnedPayments, Assert.NotNull);
        Assert.Equal(3, returnedPayments.Select(payment => payment!.Id).Distinct().Count());

        using var verificationScope = factory.Services.CreateScope();

        var verificationDb = verificationScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        Assert.Equal(
            2,
            await verificationDb.Payments.CountAsync(
                payment => payment.TenantId == 4));
        Assert.Equal(
            1,
            await verificationDb.Payments.CountAsync(
                payment => payment.TenantId == 5));

        var firstAccount = await verificationDb.Accounts
            .AsNoTracking()
            .SingleAsync(account => account.Id == 4);
        var secondAccount = await verificationDb.Accounts
            .AsNoTracking()
            .SingleAsync(account => account.Id == 5);

        Assert.Equal(800m, firstAccount.Balance);
        Assert.Equal(900m, secondAccount.Balance);
    }

    [Fact]
    public async Task CreatePayment_WithTooLongIdempotencyKey_ReturnsBadRequest()
    {
        using var factory =
            new PostgreSqlPaymentApiFactory(
                _postgres.ConnectionString);

        using var setupScope = factory.Services.CreateScope();

        var setupDb = setupScope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        await setupDb.Database.EnsureCreatedAsync();

        setupDb.Tenants.Add(new Tenant
        {
            Id = 6,
            Name = "Nyckellängdstestföretaget"
        });
        setupDb.Users.Add(new User
        {
            Id = 8,
            TenantId = 6,
            Name = "Key Length Test User",
            Email = "key-length@example.com",
            Role = UserRoles.Initiator
        });
        setupDb.Accounts.Add(new Account
        {
            Id = 6,
            TenantId = 6,
            AccountName = "Nyckellängdstestkonto",
            Iban = "SE3550000000054910000008",
            Balance = 1000m,
            Currency = "SEK"
        });

        await setupDb.SaveChangesAsync();

        var token = setupScope.ServiceProvider
            .GetRequiredService<JwtTokenService>()
            .GenerateToken(
                userId: 8,
                tenantId: 6,
                email: "key-length@example.com",
                role: UserRoles.Initiator,
                name: "Key Length Test User");

        using var client = factory.CreateClient();

        ConfigureClient(
            client,
            token,
            new string('x', Payment.MaxIdempotencyKeyLength + 1));

        var response = await client.PostAsJsonAsync(
            "/api/payments",
            CreateRequest(fromAccountId: 6));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.False(
            await setupDb.Payments.AnyAsync(
                payment => payment.TenantId == 6));
        Assert.False(
            await setupDb.AuditEntries.AnyAsync(
                entry => entry.TenantId == 6));

        var account = await setupDb.Accounts
            .AsNoTracking()
            .SingleAsync(account => account.Id == 6);

        Assert.Equal(1000m, account.Balance);
    }

    private static void ConfigureClient(
        HttpClient client,
        string token,
        string idempotencyKey)
    {
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
        client.DefaultRequestHeaders.Add(
            "Idempotency-Key",
            idempotencyKey);
    }

    private static CreatePaymentRequestDto CreateRequest(int fromAccountId)
    {
        return new CreatePaymentRequestDto
        {
            FromAccountId = fromAccountId,
            ToIban = "SE4550000000054910000099",
            Amount = 100m,
            Reference = "Idempotency scope test"
        };
    }
}
