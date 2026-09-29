using Microsoft.EntityFrameworkCore;
using Npgsql;
using SebPortal.Api.Auditing;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Notifications;
using SebPortal.Api.Services;

namespace SebPortal.Api.Tests;

/// <summary>
/// Concurrency against a real PostgreSQL (acceptance criterion: "Atomär
/// balansuppdatering — integrationstest med concurrent requests"). The in-memory
/// provider has no transactions or xmin, so these run only when SEB_TEST_POSTGRES
/// points at a server, e.g. the local compose database:
///
///   SEB_TEST_POSTGRES="Host=localhost;Port=5433;Username=seb;Password=..." dotnet test
///
/// Each test creates and drops its own database.
/// </summary>
public sealed class PostgresConcurrencyTests : IAsyncLifetime
{
    private const decimal StartBalance = 100_000m;

    private readonly string? _serverConnectionString = Environment.GetEnvironmentVariable("SEB_TEST_POSTGRES");
    private string _databaseConnectionString = string.Empty;
    private string _databaseName = string.Empty;

    public async Task InitializeAsync()
    {
        if (string.IsNullOrWhiteSpace(_serverConnectionString))
        {
            return;
        }

        _databaseName = $"seb_test_{Guid.NewGuid():N}";
        _databaseConnectionString = new NpgsqlConnectionStringBuilder(_serverConnectionString) { Database = _databaseName }.ConnectionString;

        await using var db = CreateContext();
        await db.Database.MigrateAsync();

        db.Tenants.Add(new Tenant { Id = 1, Name = "Malmö Bygg AB" });
        db.Users.AddRange(
            new User { Id = 1, TenantId = 1, Name = "Lisa Persson", Email = "lisa@malmobygg.se", Role = UserRoles.Initiator },
            new User { Id = 2, TenantId = 1, Name = "Johan Berg", Email = "johan@malmobygg.se", Role = UserRoles.Attestant },
            new User { Id = 3, TenantId = 1, Name = "Sara Ek", Email = "sara@malmobygg.se", Role = UserRoles.Admin });
        db.Accounts.Add(new Account { Id = 1, TenantId = 1, AccountName = "Driftkonto", Iban = "SE4550000000058398257466", Balance = StartBalance });
        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        if (string.IsNullOrWhiteSpace(_serverConnectionString))
        {
            return;
        }

        NpgsqlConnection.ClearAllPools();
        await using var connection = new NpgsqlConnection(_serverConnectionString);
        await connection.OpenAsync();
        await using var terminate = new NpgsqlCommand(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = @name AND pid <> pg_backend_pid()", connection);
        terminate.Parameters.AddWithValue("name", _databaseName);
        await terminate.ExecuteNonQueryAsync();
        await using var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_databaseName}\"", connection);
        await drop.ExecuteNonQueryAsync();
    }

    private SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>().UseNpgsql(_databaseConnectionString).Options;
        return new SebDbContext(options, new AuditChainInterceptor(TestServices.KeyProvider()), new NotificationOutboxInterceptor(new NotificationQueue()));
    }

    [SkippableFact]
    public async Task ConcurrentDirectPayments_NeverOverdrawTheAccount_AndKeepBalanceAndHistoryConsistent()
    {
        Skip.If(string.IsNullOrWhiteSpace(_serverConnectionString), "SEB_TEST_POSTGRES is not set.");

        // 20 simultaneous 10 000 SEK payments against 100 000 SEK: at most 10 fit.
        var attempts = Enumerable.Range(1, 20).Select(async i =>
        {
            await using var db = CreateContext();
            var service = TestServices.PaymentService(db);
            try
            {
                await service.CreatePaymentAsync(new CreatePaymentCommand(1, 1, 1, "SE3550000000054910000003", 10_000m, $"Samtidig {i}"));
                return "ok";
            }
            catch (InsufficientFundsException)
            {
                return "insufficient";
            }
            catch (DbUpdateConcurrencyException)
            {
                return "conflict";
            }
        });

        var outcomes = await Task.WhenAll(attempts);
        var succeeded = outcomes.Count(o => o == "ok");

        await using var check = CreateContext();
        var account = await check.Accounts.SingleAsync();
        var completed = await check.Payments.CountAsync(p => p.Status == PaymentStatuses.Completed);
        var transactions = await check.Transactions.Where(t => t.AccountId == 1).SumAsync(t => t.Amount);

        Assert.InRange(succeeded, 1, 10);
        Assert.Equal(succeeded, completed);
        Assert.Equal(StartBalance - 10_000m * succeeded, account.Balance);
        Assert.Equal(-10_000m * succeeded, transactions);
        Assert.True(account.Balance >= 0);

        // "Insufficient funds" is only possible once all the money is used, and a payment
        // can only miss out while money remains if it lost every retry to a conflict.
        var conflicts = outcomes.Count(o => o == "conflict");
        var insufficient = outcomes.Count(o => o == "insufficient");
        if (insufficient > 0)
        {
            Assert.Equal(10, succeeded);
        }
        if (succeeded < 10)
        {
            Assert.True(conflicts > 0);
        }

        var chain = await new AuditLogService(new Repositories.AuditLogRepository(check), TestServices.KeyProvider()).VerifyChainAsync(1);
        Assert.True(chain.Valid);
        Assert.Equal(succeeded, chain.CheckedCount);
    }

    [SkippableFact]
    public async Task TwoSimultaneousDecisionsOnTheSameStep_OnlyOneWins()
    {
        Skip.If(string.IsNullOrWhiteSpace(_serverConnectionString), "SEB_TEST_POSTGRES is not set.");

        int stepId;
        await using (var db = CreateContext())
        {
            var created = await TestServices.PaymentService(db).CreatePaymentAsync(
                new CreatePaymentCommand(1, 1, 1, "SE3550000000054910000003", 60_000m, "Attesteras samtidigt"));
            stepId = await db.ApprovalSteps.Where(s => s.PaymentId == created.Payment.Id).Select(s => s.Id).SingleAsync();
        }

        // Johan (assigned) and Sara (admin) press "Godkänn" at the same moment.
        var decisions = new[] { (UserId: 2, Role: UserRoles.Attestant), (UserId: 3, Role: UserRoles.Admin) }.Select(async who =>
        {
            await using var db = CreateContext();
            try
            {
                await TestServices.ApprovalService(db).DecideAsync(stepId, new ApprovalDecisionRequestDto { Action = "approve" }, 1, who.UserId, who.Role);
                return true;
            }
            catch (Exception ex) when (ex is ConflictException or DbUpdateConcurrencyException)
            {
                return false;
            }
        });

        var results = await Task.WhenAll(decisions);

        Assert.Single(results, won => won);
        await using var check = CreateContext();
        Assert.Equal(StartBalance - 60_000m, (await check.Accounts.SingleAsync()).Balance);
        Assert.Equal(1, await check.Transactions.CountAsync());
        Assert.Equal(1, await check.AuditEntries.CountAsync(e => e.Action == AuditActions.ApprovePayment));
    }
}
