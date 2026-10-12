using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Options;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Signing;

namespace SebPortal.Api.Tests;

public class PaymentDoubleApprovalTests
{
    private const int TenantId = 1;
    private const int CreatorId = 10;
    private const int FirstAttestantId = 20;
    private const int SecondAttestantId = 21;
    private const int AdminId = 30;
    private const int AccountId = 100;

    private static SebDbContext CreateContext() => new(
        new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static (PaymentService Payments, ApprovalService Approvals) Services(
        SebDbContext db, decimal approvalThreshold = 50000m)
    {
        var repository = new ApprovalRepository(db);
        var audit = new AuditService(
            new AuditRepository(db), new AuditLockProvider(), new UnsignedPlaceholderAuditSigner());
        var payments = new PaymentService(
            new PaymentRepository(db), repository,
            Microsoft.Extensions.Options.Options.Create(new PaymentRulesOptions
            {
                ApprovalThreshold = approvalThreshold,
                DoubleApprovalThreshold = 100000m
            }), audit);
        return (payments, new ApprovalService(repository, payments, audit));
    }

    private static async Task SeedAsync(SebDbContext db, bool includeSecond = true, bool includeAdmin = true)
    {
        db.Tenants.AddRange(
            new Tenant { Id = TenantId, Name = "Attesttest" },
            new Tenant { Id = 2, Name = "Annat företag" });
        db.Users.AddRange(
            new User { Id = CreatorId, TenantId = TenantId, Name = "Skapare", Role = UserRoles.Initiator },
            new User { Id = FirstAttestantId, TenantId = TenantId, Name = "Attestant 1", Role = UserRoles.Attestant },
            new User { Id = 40, TenantId = 2, Name = "Annan tenants attestant", Role = UserRoles.Attestant });
        if (includeSecond)
            db.Users.Add(new User { Id = SecondAttestantId, TenantId = TenantId, Name = "Attestant 2", Role = UserRoles.Attestant });
        if (includeAdmin)
            db.Users.Add(new User { Id = AdminId, TenantId = TenantId, Name = "Administratör", Role = UserRoles.Admin });
        db.Accounts.Add(new Account
        {
            Id = AccountId, TenantId = TenantId, AccountName = "Testkonto",
            Iban = "SE4550000000058398257466", Currency = "SEK", Balance = 500000m
        });
        await db.SaveChangesAsync();
    }

    private static Task<Payment> CreateAsync(PaymentService service, decimal amount, int creatorId = CreatorId) =>
        service.CreatePaymentAsync(TenantId, AccountId, "SE8550000000054910000004",
            amount, "SEK", "Beloppsregel", creatorId);

    private static ApprovalDecisionRequestDto Approve() => new() { Action = "approve" };

    [Theory]
    [InlineData("99999.99", 1)]
    [InlineData("100000.00", 1)]
    [InlineData("100000.01", 2)]
    public async Task CreatePayment_UsesStrict100000BoundaryAndCreatesAllRequiredSteps(
        string amountText, int expectedSteps)
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var (payments, _) = Services(db);
        var amount = decimal.Parse(amountText, CultureInfo.InvariantCulture);

        var payment = await CreateAsync(payments, amount);

        db.ChangeTracker.Clear();
        var saved = await db.Payments.Include(p => p.ApprovalSteps).SingleAsync();
        Assert.Equal(PaymentStatuses.PendingApproval, saved.Status);
        Assert.Null(saved.ExecutedAt);
        Assert.Equal(expectedSteps, saved.ApprovalSteps.Count);
        Assert.Equal(Enumerable.Range(1, expectedSteps),
            saved.ApprovalSteps.OrderBy(s => s.StepNumber).Select(s => s.StepNumber));
        Assert.All(saved.ApprovalSteps, s =>
        {
            Assert.Equal(ApprovalStatuses.Pending, s.Status);
            Assert.Null(s.DecidedById);
            Assert.Null(s.DecidedAt);
            Assert.NotEqual(CreatorId, s.AttestantId);
        });
        Assert.Equal(expectedSteps, saved.ApprovalSteps.Select(s => s.AttestantId).Distinct().Count());
        Assert.Equal(500000m, (await db.Accounts.SingleAsync()).Balance);
        Assert.Empty(await db.Transactions.ToListAsync());
        Assert.Equal(expectedSteps == 2, payments.RequiresDoubleApproval(amount));
        Assert.Equal(payment.Id, Assert.Single(await db.AuditEntries.ToListAsync()).EntityId);
    }

    [Fact]
    public async Task CreatePayment_ExcludesCreatorAndOtherTenantFromBothAssignments()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var (payments, _) = Services(db);

        await CreateAsync(payments, 150000m, creatorId: FirstAttestantId);

        var assignedIds = await db.ApprovalSteps.OrderBy(s => s.StepNumber)
            .Select(s => s.AttestantId).ToListAsync();
        Assert.Equal(new int?[] { SecondAttestantId, AdminId }, assignedIds);
    }

    [Fact]
    public async Task CreatePayment_WithOneEligibleAttestant_LeavesSecondStepUnassigned()
    {
        using var db = CreateContext();
        await SeedAsync(db, includeSecond: false, includeAdmin: false);
        var (payments, _) = Services(db);

        await CreateAsync(payments, 150000m);

        var steps = await db.ApprovalSteps.OrderBy(s => s.StepNumber).ToListAsync();
        Assert.Equal(2, steps.Count);
        Assert.Equal(FirstAttestantId, steps[0].AttestantId);
        Assert.Null(steps[1].AttestantId);
        Assert.Equal(ApprovalStatuses.Pending, steps[1].Status);
        Assert.Equal(PaymentStatuses.PendingApproval, (await db.Payments.SingleAsync()).Status);
        Assert.Empty(await db.Transactions.ToListAsync());
    }

    [Fact]
    public async Task CreatePayment_RaisedSingleApprovalThresholdCannotBypassDoubleApprovalRule()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var (payments, _) = Services(db, approvalThreshold: 200000m);

        var payment = await CreateAsync(payments, 150000m);

        Assert.Equal(PaymentStatuses.PendingApproval, payment.Status);
        Assert.Equal(2, await db.ApprovalSteps.CountAsync());
        Assert.Null(payment.ExecutedAt);
        Assert.Equal(500000m, (await db.Accounts.SingleAsync()).Balance);
        Assert.Empty(await db.Transactions.ToListAsync());
    }

    [Fact]
    public async Task Approve_LegacyUnknownDecisionCannotCountAsAnotherPerson()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var (payments, approvals) = Services(db);
        var payment = await CreateAsync(payments, 150000m);
        var steps = await db.ApprovalSteps.OrderBy(s => s.StepNumber).ToListAsync();
        var legacy = steps[0];
        legacy.Status = ApprovalStatuses.Approved;
        legacy.DecidedById = null;
        legacy.DecidedAt = DateTime.UtcNow.AddDays(-1);
        legacy.DecisionSource = null;
        await db.SaveChangesAsync();

        var firstKnownDecision = await approvals.DecideAsync(
            steps[1].PublicId, Approve(), TenantId, SecondAttestantId, UserRoles.Attestant);

        Assert.Equal(PaymentStatuses.PendingApproval, firstKnownDecision.PaymentStatus);
        Assert.Null(payment.ExecutedAt);
        Assert.Equal(500000m, (await db.Accounts.SingleAsync()).Balance);
        Assert.Empty(await db.Transactions.ToListAsync());
        var replacement = Assert.Single(await db.ApprovalSteps
            .Where(s => s.Status == ApprovalStatuses.Pending).ToListAsync());
        Assert.Equal(3, replacement.StepNumber);
        Assert.Equal(AdminId, replacement.AttestantId);
        Assert.Null(legacy.DecidedById);

        var secondKnownDecision = await approvals.DecideAsync(
            replacement.PublicId, Approve(), TenantId, AdminId, UserRoles.Admin);

        Assert.Equal(PaymentStatuses.Completed, secondKnownDecision.PaymentStatus);
        Assert.Equal(350000m, (await db.Accounts.SingleAsync()).Balance);
        Assert.Equal(-150000m, Assert.Single(await db.Transactions.ToListAsync()).Amount);
        Assert.Null(legacy.DecidedById);
    }

    [Fact]
    public async Task Approve_LegacyDuplicateActorCannotApproveAnotherPendingStep()
    {
        using var db = CreateContext();
        await SeedAsync(db);
        var (payments, approvals) = Services(db);
        var payment = await CreateAsync(payments, 150000m);
        var steps = await db.ApprovalSteps.OrderBy(s => s.StepNumber).ToListAsync();
        foreach (var step in steps)
        {
            step.Status = ApprovalStatuses.Approved;
            step.DecidedById = AdminId;
            step.DecidedAt = DateTime.UtcNow.AddDays(-1);
            step.DecisionSource = ApprovalDecisionSources.Manual;
        }
        // An old imported sequence can have gaps and duplicate actual actors.
        db.Users.Add(new User { Id = 31, TenantId = TenantId, Name = "Annan administratör", Role = UserRoles.Admin });
        var pending = new ApprovalStep
        {
            PaymentId = payment.Id, AttestantId = AdminId, StepNumber = 8,
            Status = ApprovalStatuses.Pending
        };
        db.ApprovalSteps.Add(pending);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<DuplicateApprovalDecisionException>(() => approvals.DecideAsync(
            pending.PublicId, Approve(), TenantId, AdminId, UserRoles.Admin));

        Assert.Equal(ApprovalStatuses.Pending, pending.Status);
        Assert.Null(pending.DecidedById);
        Assert.Null(pending.DecidedAt);
        Assert.Equal(3, await db.ApprovalSteps.CountAsync());
        Assert.Equal(500000m, (await db.Accounts.SingleAsync()).Balance);
        Assert.Empty(await db.Transactions.ToListAsync());
        Assert.Single(await db.AuditEntries.ToListAsync());

        var otherActorDecision = await approvals.DecideAsync(
            pending.PublicId, Approve(), TenantId, 31, UserRoles.Admin);

        Assert.Equal(PaymentStatuses.Completed, otherActorDecision.PaymentStatus);
        Assert.Equal(350000m, (await db.Accounts.SingleAsync()).Balance);
        Assert.Equal(-150000m, Assert.Single(await db.Transactions.ToListAsync()).Amount);
        Assert.Equal(new int?[] { AdminId, 31 }, await db.ApprovalSteps
            .Select(s => s.DecidedById).Distinct().OrderBy(id => id).ToListAsync());
    }

    [Fact]
    public async Task Approve_MissingStepExcludesActualActorAndAssignedUsersAndUsesMaxStepNumber()
    {
        using var db = CreateContext();
        await SeedAsync(db, includeSecond: false);
        db.Users.Add(new User { Id = 31, TenantId = TenantId, Name = "Ny attestant", Role = UserRoles.Attestant });
        var payment = new Payment
        {
            Id = 42, TenantId = TenantId, FromAccountId = AccountId,
            Amount = 150000m, Currency = "SEK", ToIban = "SE8550000000054910000004",
            CreatedById = CreatorId, Status = PaymentStatuses.PendingApproval
        };
        var step = new ApprovalStep
        {
            Payment = payment, AttestantId = FirstAttestantId, StepNumber = 4,
            Status = ApprovalStatuses.Pending
        };
        db.Payments.Add(payment);
        db.ApprovalSteps.Add(step);
        await db.SaveChangesAsync();
        var (_, approvals) = Services(db);

        var decision = await approvals.DecideAsync(
            step.PublicId, Approve(), TenantId, AdminId, UserRoles.Admin);

        Assert.Equal(PaymentStatuses.PendingApproval, decision.PaymentStatus);
        var replacement = Assert.Single(await db.ApprovalSteps
            .Where(s => s.Status == ApprovalStatuses.Pending).ToListAsync());
        Assert.Equal(5, replacement.StepNumber);
        Assert.Equal(31, replacement.AttestantId);
        Assert.Equal(AdminId, step.DecidedById);
        Assert.Equal(500000m, (await db.Accounts.SingleAsync()).Balance);
        Assert.Empty(await db.Transactions.ToListAsync());
    }
}
