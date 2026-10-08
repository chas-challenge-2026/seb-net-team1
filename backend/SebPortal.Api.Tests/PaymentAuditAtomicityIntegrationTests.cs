using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Signing;

namespace SebPortal.Api.Tests;

/// <summary>
/// Proves against a real PostgreSQL database that a payment and its CREATE_PAYMENT
/// audit entry are saved together or not at all. The in-memory database used by the
/// unit tests has no transactions, so this cannot be proven there.
/// </summary>
public sealed class PaymentAuditAtomicityIntegrationTests
	: IClassFixture<PostgreSqlFixture>
{
	private readonly PostgreSqlFixture _postgres;

	public PaymentAuditAtomicityIntegrationTests(PostgreSqlFixture postgres)
	{
		_postgres = postgres;
	}

	/// <summary>A signer that always fails, to break the audit step on purpose.</summary>
	private sealed class FailingSigner : IAuditSigner
	{
		public string Sign(string canonicalJson) =>
			throw new InvalidOperationException("Audit signing failed on purpose.");

		public bool Verify(string canonicalJson, string signature) => false;
	}

	private async Task<(PostgreSqlPaymentApiFactory Factory, string Token)> SeedAsync()
	{
		// Every test gets its own empty database, so tests never see each other's rows.
		// EnsureDeleted is deliberately not used: it runs DROP DATABASE ... WITH (FORCE),
		// which PostgreSQL 12 (the version the project runs on) does not support.
		var connectionString = new NpgsqlConnectionStringBuilder(_postgres.ConnectionString)
		{
			Database = $"seb_audit_{Guid.NewGuid():N}"
		}.ConnectionString;

		var factory = new PostgreSqlPaymentApiFactory(connectionString);

		using var scope = factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();

		await db.Database.EnsureCreatedAsync();

		db.Tenants.Add(new Tenant { Id = 1, Name = "Testföretaget" });
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
			Balance = 100000m,
			Currency = "SEK"
		});

		await db.SaveChangesAsync();

		var token = scope.ServiceProvider
			.GetRequiredService<JwtTokenService>()
			.GenerateToken(1, 1, "test@example.com", UserRoles.Initiator, "Test User");

		return (factory, token);
	}

	private static CreatePaymentRequestDto Request(decimal amount) => new()
	{
		FromAccountId = 1,
		ToIban = "SE4550000000054910000099",
		Amount = amount,
		Reference = "Atomicity test"
	};

	[Theory]
	[InlineData(60000)]
	[InlineData(150000)]
	[InlineData(500)]
	public async Task CreatePayment_WhenAuditStepFails_SavesNoPaymentAndKeepsBalance(decimal amount)
	{
		var (baseFactory, token) = await SeedAsync();
		using var _ = baseFactory;

		using var factory = baseFactory.WithWebHostBuilder(builder =>
			builder.ConfigureServices(services =>
			{
				services.RemoveAll<IAuditSigner>();
				services.AddSingleton<IAuditSigner, FailingSigner>();
			}));

		using var client = factory.CreateClient();
		client.DefaultRequestHeaders.Authorization =
			new AuthenticationHeaderValue("Bearer", token);

		var response = await client.PostAsJsonAsync("/api/payments", Request(amount));

		Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

		using var scope = factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();

		Assert.Empty(await db.Payments.AsNoTracking().ToListAsync());
		Assert.Empty(await db.ApprovalSteps.AsNoTracking().ToListAsync());
		Assert.Empty(await db.Transactions.AsNoTracking().ToListAsync());
		Assert.Empty(await db.AuditEntries.AsNoTracking().ToListAsync());
		Assert.Equal(
			100000m,
			(await db.Accounts.AsNoTracking().SingleAsync(a => a.Id == 1)).Balance);
	}

	[Theory]
	[InlineData(60000, 1)]
	[InlineData(150000, 2)]
	public async Task CreatePayment_WhenEverythingWorks_SavesPaymentAndAuditEntryTogether(decimal amount, int expectedSteps)
	{
		var (factory, token) = await SeedAsync();
		using var _ = factory;

		using var client = factory.CreateClient();
		client.DefaultRequestHeaders.Authorization =
			new AuthenticationHeaderValue("Bearer", token);

		var response = await client.PostAsJsonAsync("/api/payments", Request(amount));

		Assert.Equal(HttpStatusCode.Created, response.StatusCode);

		using var scope = factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();

		var payment = await db.Payments.AsNoTracking().SingleAsync();
		var entry = await db.AuditEntries.AsNoTracking().SingleAsync();

		Assert.Equal("CREATE_PAYMENT", entry.Action);
		Assert.Equal(payment.Id, entry.EntityId);
		Assert.Equal("GENESIS", entry.PreviousSignature);
		Assert.Equal(expectedSteps, await db.ApprovalSteps.CountAsync());
	}
}
