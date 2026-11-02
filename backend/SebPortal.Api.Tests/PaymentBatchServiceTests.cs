using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Options;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Signing;

namespace SebPortal.Api.Tests;

/// <summary>
/// Tests the all-or-nothing batch rules: every row is validated first, and payments
/// are only created when no row has a problem.
/// </summary>
public class PaymentBatchServiceTests
{
    private const string ValidIban = "SE4550000000054910000099";
    private const string InvalidIban = "SE0000000000000000000000";

    /// <summary>Stands in for libiban, which only exists in the Docker build.</summary>
    private sealed class TestPaymentBatchService(PaymentRepository repository, PaymentService service)
        : PaymentBatchService(repository, service)
    {
        protected override string? GetIbanError(string iban) =>
            iban == InvalidIban ? "IBAN:ens kontrollsiffror är ogiltiga." : null;
    }

    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(options);
    }

    private static PaymentBatchService CreateService(SebDbContext db)
    {
        var paymentRepository = new PaymentRepository(db);

        var paymentRules = Microsoft.Extensions.Options.Options.Create(
            new PaymentRulesOptions
            {
                ApprovalThreshold = 50000m,
                DoubleApprovalThreshold = 200000m
            });

        var auditService = new AuditService(
            new AuditRepository(db),
            new AuditLockProvider(),
            new UnsignedPlaceholderAuditSigner());

        var paymentService = new PaymentService(
            paymentRepository,
            new ApprovalRepository(db),
            paymentRules,
            auditService);

        return new TestPaymentBatchService(paymentRepository, paymentService);
    }

    private static async Task SeedAsync(SebDbContext db, decimal balance = 100000m)
    {
        db.Tenants.AddRange(
            new Tenant { Id = 1, Name = "Testföretaget" },
            new Tenant { Id = 2, Name = "Andra företaget" });

        db.Users.AddRange(
            new User { Id = 1, TenantId = 1, Name = "Lisa", Email = "lisa@example.com", Role = UserRoles.Initiator },
            new User { Id = 2, TenantId = 1, Name = "Johan", Email = "johan@example.com", Role = UserRoles.Attestant });

        db.Accounts.AddRange(
            new Account { Id = 1, TenantId = 1, AccountName = "Företagskonto", Iban = "SE3550000000054910000003", Balance = balance, Currency = "SEK" },
            new Account { Id = 2, TenantId = 2, AccountName = "Annat bolag", Iban = "SE3550000000054910000004", Balance = balance, Currency = "SEK" });

        await db.SaveChangesAsync();
    }

    private static BatchPaymentRow Row(
        int accountId = 1, string iban = ValidIban, decimal? amount = 1000m, string reference = "Faktura") =>
        new(accountId, iban, amount, amount?.ToString("0.00", CultureInfo.InvariantCulture) ?? "NaN", reference);

    [Fact]
    public async Task CreateAsync_WhenEveryRowIsValid_CreatesAllPaymentsAndAuditEntries()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var service = CreateService(db);

        var result = await service.CreateAsync(1, 1, [
            Row(amount: 1000m),
            Row(amount: 2500.50m),
            Row(amount: 75000m)
        ]);

        Assert.Empty(result.RowErrors);
        Assert.Equal(3, result.Payments.Count);

        Assert.Equal(3, await db.Payments.CountAsync());
        Assert.Equal(2, result.Payments.Count(p => p.Status == PaymentStatuses.Completed));
        Assert.Equal(1, result.Payments.Count(p => p.Status == PaymentStatuses.PendingApproval));

        // Only the two completed payments take money now.
        var account = await db.Accounts.FirstAsync(a => a.Id == 1);
        Assert.Equal(100000m - 1000m - 2500.50m, account.Balance);

        // The large payment waits for an attestant.
        var step = await db.ApprovalSteps.SingleAsync();
        Assert.Equal(2, step.AttestantId);

        // One CREATE_PAYMENT audit entry per payment, chained to the previous one.
        var entries = await db.AuditEntries.OrderBy(e => e.Id).ToListAsync();
        Assert.Equal(3, entries.Count);
        Assert.All(entries, e => Assert.Equal("CREATE_PAYMENT", e.Action));
        Assert.Equal(entries[0].Signature, entries[1].PreviousSignature);
        Assert.Equal(entries[1].Signature, entries[2].PreviousSignature);
    }

    [Fact]
    public async Task CreateAsync_WhenOneRowHasInvalidIban_CreatesNothingAndNamesTheRow()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var service = CreateService(db);

        var result = await service.CreateAsync(1, 1, [
            Row(),
            Row(iban: InvalidIban, amount: 500m, reference: "Fel"),
            Row()
        ]);

        var error = Assert.Single(result.RowErrors);

        // Row 1 is the header, so the second data row is row 3.
        Assert.Equal(3, error.RowNumber);
        Assert.Equal($"1,{InvalidIban},500.00,Fel", error.Content);
        Assert.Contains("kontrollsiffror", error.Error);

        Assert.Empty(result.Payments);
        Assert.Empty(db.Payments);
        Assert.Empty(db.AuditEntries);
        Assert.Equal(100000m, (await db.Accounts.FirstAsync(a => a.Id == 1)).Balance);
    }

    [Fact]
    public async Task ValidateAsync_WhenIbanHasSpacesAndLowerCase_NormalizesBeforeChecking()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var service = CreateService(db);

        var errors = await service.ValidateAsync(1, [
            Row(iban: InvalidIban.ToLowerInvariant().Insert(4, " "))
        ]);

        Assert.Single(errors);
    }

    [Fact]
    public async Task ValidateAsync_WhenAccountBelongsToAnotherTenant_ReportsNotFound()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var service = CreateService(db);

        var errors = await service.ValidateAsync(1, [
            Row(accountId: 2),
            Row(accountId: 999)
        ]);

        // Same message for "other tenant" and "does not exist", nothing leaks across tenants.
        Assert.Equal(2, errors.Count);
        Assert.All(errors, e => Assert.Equal("Kontot hittades inte.", e.Error));
    }

    [Fact]
    public async Task ValidateAsync_WhenRowsTogetherExceedBalance_FailsTheRowThatOverdraws()
    {
        using var db = CreateContext();
        await SeedAsync(db, balance: 60000m);
        var service = CreateService(db);

        // Each row fits the balance alone, the second one does not fit after the first.
        var errors = await service.ValidateAsync(1, [
            Row(amount: 40000m),
            Row(amount: 40000m)
        ]);

        var error = Assert.Single(errors);
        Assert.Equal(3, error.RowNumber);
        Assert.Contains("saldo", error.Error);
    }

    [Fact]
    public async Task ValidateAsync_WhenRowRequiresApproval_DoesNotCountItAgainstTheBalance()
    {
        using var db = CreateContext();
        await SeedAsync(db, balance: 80000m);
        var service = CreateService(db);

        // 70000 waits for approval and takes no money now, so the second row still fits.
        var errors = await service.ValidateAsync(1, [
            Row(amount: 70000m),
            Row(amount: 40000m)
        ]);

        Assert.Empty(errors);
    }

    [Fact]
    public async Task ValidateAsync_WhenRowHasSeveralProblems_JoinsThemIntoOneError()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var service = CreateService(db);

        var errors = await service.ValidateAsync(1, [
            Row(iban: InvalidIban, amount: 0m)
        ]);

        var error = Assert.Single(errors);
        Assert.Contains("kontrollsiffror", error.Error);
        Assert.Contains("större än 0", error.Error);
    }

    [Fact]
    public async Task ValidateAsync_WhenAmountCannotBeRepresented_ReportsInvalidAmount()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var service = CreateService(db);

        var errors = await service.ValidateAsync(1, [
            Row(amount: null)
        ]);

        var error = Assert.Single(errors);
        Assert.Contains("giltigt belopp", error.Error);
    }

    [Fact]
    public async Task ValidateAsync_WhenBadRowComesFirst_DoesNotDeductItFromTheBalance()
    {
        using var db = CreateContext();
        await SeedAsync(db, balance: 50000m);
        var service = CreateService(db);

        // The bad row would use the whole balance, but it is invalid, so it must not
        // make the valid row after it look like it overdraws.
        var errors = await service.ValidateAsync(1, [
            Row(iban: InvalidIban, amount: 50000m),
            Row(amount: 50000m)
        ]);

        var error = Assert.Single(errors);
        Assert.Equal(2, error.RowNumber);
    }
}
