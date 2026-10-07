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

/// <summary>
/// Tests the US-25/US-26 approval rules: who may see and decide a step, what a
/// decision does to the payment, and the single threshold that decides whether a
/// payment needs two attestants. See contracts/approvals-contract.md.
/// </summary>
public class ApprovalServiceTests
{
    private const int TenantId = 1;
    private const int OtherTenantId = 2;

    private const int InitiatorId = 10;
    private const int AttestantId = 20;
    private const int OtherAttestantId = 21;
    private const int AdminId = 30;

    private const int AccountId = 100;

    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(options);
    }

    private static ApprovalService CreateApprovalService(
        SebDbContext db,
        decimal approvalThreshold = 50000m,
        decimal doubleApprovalThreshold = 200000m)
    {
        var paymentRules = Microsoft.Extensions.Options.Options.Create(
            new PaymentRulesOptions
            {
                ApprovalThreshold = approvalThreshold,
                DoubleApprovalThreshold = doubleApprovalThreshold
            });

        var paymentService = new PaymentService(new PaymentRepository(db), paymentRules);

        var auditService = new AuditService(
            new AuditRepository(db), new AuditLockProvider(), new UnsignedPlaceholderAuditSigner());

        return new ApprovalService(new ApprovalRepository(db), paymentService, auditService);
    }

    /// <summary>
    /// Seeds one tenant with an initiator, two attestants, an admin and an account,
    /// plus a second tenant used for the cross tenant tests.
    /// </summary>
    private static void SeedUsersAndAccount(SebDbContext db, decimal balance = 1000000m)
    {
        db.Tenants.AddRange(
            new Tenant { Id = TenantId, Name = "Malmö Bygg AB" },
            new Tenant { Id = OtherTenantId, Name = "Annat Bolag AB" });

        db.Users.AddRange(
            new User { Id = InitiatorId, TenantId = TenantId, Name = "Lisa Persson", Role = UserRoles.Initiator },
            new User { Id = AttestantId, TenantId = TenantId, Name = "Johan Berg", Role = UserRoles.Attestant },
            new User { Id = OtherAttestantId, TenantId = TenantId, Name = "Eva Nord", Role = UserRoles.Attestant },
            new User { Id = AdminId, TenantId = TenantId, Name = "Sara Ek", Role = UserRoles.Admin });

        db.Accounts.Add(new Account
        {
            Id = AccountId,
            TenantId = TenantId,
            AccountName = "Driftkonto",
            Iban = "SE4550000000058398257466",
            Balance = balance,
            Currency = "SEK"
        });

        db.SaveChanges();
    }

    private static Payment SeedPendingPayment(
        SebDbContext db,
        int paymentId,
        decimal amount,
        int tenantId = TenantId,
        string reference = "Faktura #1043")
    {
        var payment = new Payment
        {
            Id = paymentId,
            TenantId = tenantId,
            FromAccountId = AccountId,
            ToIban = "SE8550000000054910000004",
            Amount = amount,
            Currency = "SEK",
            Reference = reference,
            Status = PaymentStatuses.PendingApproval,
            CreatedById = InitiatorId,
            CreatedAt = new DateTime(2026, 8, 30, 9, 15, 0, DateTimeKind.Utc)
        };

        db.Payments.Add(payment);
        db.SaveChanges();

        return payment;
    }

    private static ApprovalStep SeedStep(
        SebDbContext db,
        int stepId,
        int paymentId,
        int? attestantId,
        int stepNumber = 1,
        string status = ApprovalStatuses.Pending,
        DateTime? decidedAt = null)
    {
        var step = new ApprovalStep
        {
            Id = stepId,
            PublicId = TestIds.Step(stepId),
            PaymentId = paymentId,
            AttestantId = attestantId,
            StepNumber = stepNumber,
            Status = status,
            DecidedAt = decidedAt
        };

        db.ApprovalSteps.Add(step);
        db.SaveChanges();

        return step;
    }

    private static ApprovalDecisionRequestDto Approve(string? comment = null) =>
        new() { Action = "approve", Comment = comment };

    private static ApprovalDecisionRequestDto Reject(string? comment = null) =>
        new() { Action = "reject", Comment = comment };

    // -----------------------------------------------------------------------
    // GET /api/approvals
    // -----------------------------------------------------------------------

    /// <summary>
    /// An attestant only sees steps assigned to them. This is the read side of
    /// BUG-011: the inbox is scoped by the id in the JWT, never by a client value.
    /// </summary>
    [Fact]
    public async Task GetInboxAsync_ForAttestant_ReturnsOnlyStepsAssignedToThem()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 1, amount: 75000m);
        SeedPendingPayment(db, paymentId: 2, amount: 60000m);

        SeedStep(db, stepId: 501, paymentId: 1, attestantId: AttestantId);
        SeedStep(db, stepId: 502, paymentId: 2, attestantId: OtherAttestantId);

        var service = CreateApprovalService(db);

        var inbox = await service.GetInboxAsync(TenantId, AttestantId, UserRoles.Attestant);

        Assert.Single(inbox.Pending);
        Assert.Equal(TestIds.Step(501), inbox.Pending[0].ApprovalStepId);
        Assert.Equal(1, inbox.Pending[0].PaymentId);
    }

    /// <summary>An admin sees every pending step in their own tenant.</summary>
    [Fact]
    public async Task GetInboxAsync_ForAdmin_ReturnsAllPendingStepsInTenant()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 1, amount: 75000m);
        SeedPendingPayment(db, paymentId: 2, amount: 60000m);
        SeedPendingPayment(db, paymentId: 3, amount: 90000m, tenantId: OtherTenantId);

        SeedStep(db, stepId: 501, paymentId: 1, attestantId: AttestantId);
        SeedStep(db, stepId: 502, paymentId: 2, attestantId: OtherAttestantId);
        SeedStep(db, stepId: 503, paymentId: 3, attestantId: OtherAttestantId);

        var service = CreateApprovalService(db);

        var inbox = await service.GetInboxAsync(TenantId, AdminId, UserRoles.Admin);

        Assert.Equal(2, inbox.Pending.Count);
        Assert.DoesNotContain(inbox.Pending, p => p.PaymentId == 3);
    }

    /// <summary>
    /// The pending payment is described exactly as the contract states: money as a
    /// decimal string, names resolved, and the double approval flag computed by the
    /// backend so the frontend never has to know the amount rule.
    /// </summary>
    [Fact]
    public async Task GetInboxAsync_MapsPendingPaymentAccordingToContract()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 42, amount: 250000m, reference: "Faktura 2026-114");
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var inbox = await service.GetInboxAsync(TenantId, AttestantId, UserRoles.Attestant);

        var pending = Assert.Single(inbox.Pending);
        Assert.Equal(42, pending.PaymentId);
        Assert.Equal(TestIds.Step(501), pending.ApprovalStepId);
        Assert.Equal("SE8550000000054910000004", pending.ToIban);
        Assert.Equal("250000.00", pending.Amount);
        Assert.Equal("SEK", pending.Currency);
        Assert.Equal("Faktura 2026-114", pending.Reference);
        Assert.Equal("Lisa Persson", pending.CreatedByName);
        Assert.Equal("Driftkonto", pending.FromAccountName);
        Assert.Equal(1, pending.CurrentStep);
        Assert.Equal(2, pending.TotalSteps);
        Assert.True(pending.RequiresDoubleApproval);
    }

    /// <summary>
    /// A payment below the double approval threshold needs a single step, and the
    /// badge stays off.
    /// </summary>
    [Fact]
    public async Task GetInboxAsync_BelowDoubleApprovalThreshold_NeedsOneStepOnly()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var inbox = await service.GetInboxAsync(TenantId, AttestantId, UserRoles.Attestant);

        var pending = Assert.Single(inbox.Pending);
        Assert.False(pending.RequiresDoubleApproval);
        Assert.Equal(1, pending.TotalSteps);
    }

    /// <summary>Steps this attestant has already decided end up in recentlyHandled.</summary>
    [Fact]
    public async Task GetInboxAsync_ReturnsOwnDecidedStepsAsRecentlyHandled()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 40, amount: 8000m);
        var decidedAt = new DateTime(2026, 8, 29, 14, 0, 0, DateTimeKind.Utc);

        var step = SeedStep(
            db,
            stepId: 500,
            paymentId: 40,
            attestantId: AttestantId,
            status: ApprovalStatuses.Approved,
            decidedAt: decidedAt);

        step.Comment = "Ser korrekt ut";
        db.SaveChanges();

        var service = CreateApprovalService(db);

        var inbox = await service.GetInboxAsync(TenantId, AttestantId, UserRoles.Attestant);

        Assert.Empty(inbox.Pending);

        var handled = Assert.Single(inbox.RecentlyHandled);
        Assert.Equal(40, handled.PaymentId);
        Assert.Equal("8000.00", handled.Amount);
        Assert.Equal(ApprovalStatuses.Approved, handled.Status);
        Assert.Equal(decidedAt, handled.DecidedAt);
        Assert.Equal("Ser korrekt ut", handled.Comment);
    }

    // -----------------------------------------------------------------------
    // POST /api/approvals/{approvalStepId}/decision — approve
    // -----------------------------------------------------------------------

    /// <summary>
    /// The final approval completes the payment: status, execution timestamp,
    /// balance and transaction history are updated through the same code path as a
    /// payment that never needed approval, and the decision is audited to the
    /// database (v1 wrote some of these to /tmp/audit.log only).
    /// </summary>
    [Fact]
    public async Task DecideAsync_ApproveLastStep_CompletesPaymentAndDeductsBalance()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        var payment = SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var decision = await service.DecideAsync(
            TestIds.Step(501), Approve("Ser korrekt ut"), TenantId, AttestantId, UserRoles.Attestant);

        Assert.Equal(42, decision.PaymentId);
        Assert.Equal(TestIds.Step(501), decision.ApprovalStepId);
        Assert.Equal(ApprovalStatuses.Approved, decision.StepStatus);
        Assert.Equal(PaymentStatuses.Completed, decision.PaymentStatus);

        Assert.Equal(PaymentStatuses.Completed, payment.Status);
        Assert.NotNull(payment.ExecutedAt);

        var account = await db.Accounts.Include(a => a.Transactions).FirstAsync(a => a.Id == AccountId);
        Assert.Equal(425000m, account.Balance);
        Assert.Equal(-75000m, Assert.Single(account.Transactions).Amount);

        var step = await db.ApprovalSteps.FirstAsync(s => s.Id == 501);
        Assert.Equal("Ser korrekt ut", step.Comment);
        Assert.NotNull(step.DecidedAt);

        var audit = Assert.Single(db.AuditEntries.ToList());
        Assert.Equal("APPROVE_PAYMENT", audit.Action);
        Assert.Equal(AttestantId, audit.UserId);
        Assert.Equal(42, audit.EntityId);
    }

    /// <summary>
    /// With a step still outstanding the payment stays pending and no money moves,
    /// which is what the contract's "pending_approval (if more steps remain)" means.
    /// </summary>
    [Fact]
    public async Task DecideAsync_ApproveWhenAnotherStepRemains_KeepsPaymentPending()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        var payment = SeedPendingPayment(db, paymentId: 42, amount: 250000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId, stepNumber: 1);
        SeedStep(db, stepId: 502, paymentId: 42, attestantId: OtherAttestantId, stepNumber: 2);

        var service = CreateApprovalService(db);

        var decision = await service.DecideAsync(
            TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant);

        Assert.Equal(PaymentStatuses.PendingApproval, decision.PaymentStatus);
        Assert.Equal(PaymentStatuses.PendingApproval, payment.Status);
        Assert.Null(payment.ExecutedAt);

        var account = await db.Accounts.FirstAsync(a => a.Id == AccountId);
        Assert.Equal(500000m, account.Balance);

        var audit = Assert.Single(db.AuditEntries.ToList());
        Assert.Equal("APPROVE_PAYMENT_STEP", audit.Action);
    }

    /// <summary>
    /// BUG-006: a payment over the double approval threshold that somehow only has
    /// one step must not complete on a single approval. The missing step is created
    /// and handed to another attestant instead, so the payment neither slips through
    /// nor gets stuck with nobody able to act on it.
    /// </summary>
    [Fact]
    public async Task DecideAsync_ApproveOnlyStepOfDoubleApprovalPayment_CreatesSecondStep()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        var payment = SeedPendingPayment(db, paymentId: 42, amount: 300000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var decision = await service.DecideAsync(
            TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant);

        Assert.Equal(PaymentStatuses.PendingApproval, decision.PaymentStatus);
        Assert.Equal(PaymentStatuses.PendingApproval, payment.Status);

        var steps = await db.ApprovalSteps.Where(s => s.PaymentId == 42).OrderBy(s => s.StepNumber).ToListAsync();
        Assert.Equal(2, steps.Count);

        var secondStep = steps[1];
        Assert.Equal(2, secondStep.StepNumber);
        Assert.Equal(ApprovalStatuses.Pending, secondStep.Status);
        Assert.NotEqual(Guid.Empty, secondStep.PublicId);
        Assert.NotEqual(steps[0].PublicId, secondStep.PublicId);

        // Never the same person twice, and never the person who created the payment.
        Assert.NotEqual(AttestantId, secondStep.AttestantId);
        Assert.NotEqual(InitiatorId, secondStep.AttestantId);

        var account = await db.Accounts.FirstAsync(a => a.Id == AccountId);
        Assert.Equal(500000m, account.Balance);
    }

    /// <summary>
    /// Approving that second step is what finally completes the payment, so a
    /// double approval payment can still reach "completed" (v1 deadlocked here).
    /// </summary>
    [Fact]
    public async Task DecideAsync_ApproveBothSteps_CompletesDoubleApprovalPayment()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        SeedPendingPayment(db, paymentId: 42, amount: 300000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId, stepNumber: 1);
        SeedStep(db, stepId: 502, paymentId: 42, attestantId: OtherAttestantId, stepNumber: 2);

        var service = CreateApprovalService(db);

        await service.DecideAsync(TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant);

        var decision = await service.DecideAsync(
            TestIds.Step(502), Approve(), TenantId, OtherAttestantId, UserRoles.Attestant);

        Assert.Equal(PaymentStatuses.Completed, decision.PaymentStatus);

        var account = await db.Accounts.FirstAsync(a => a.Id == AccountId);
        Assert.Equal(200000m, account.Balance);
    }

    /// <summary>
    /// The threshold comes from configuration only. Raising it means the same
    /// 300 000 SEK payment completes on one approval, with no second value hidden
    /// anywhere else in the code (BUG-006).
    /// </summary>
    [Fact]
    public async Task DecideAsync_WhenAmountIsBelowConfiguredThreshold_CompletesOnASingleApproval()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        SeedPendingPayment(db, paymentId: 42, amount: 300000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db, doubleApprovalThreshold: 500000m);

        var decision = await service.DecideAsync(
            TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant);

        Assert.Equal(PaymentStatuses.Completed, decision.PaymentStatus);
        Assert.Single(await db.ApprovalSteps.Where(s => s.PaymentId == 42).ToListAsync());
    }

    /// <summary>
    /// A payment is never completed without enough money on the account. The
    /// approval fails with the same 400 a direct payment would return.
    /// </summary>
    [Fact]
    public async Task DecideAsync_ApproveWithoutSufficientFunds_ThrowsInsufficientFunds()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 1000m);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        await Assert.ThrowsAsync<InsufficientFundsException>(() =>
            service.DecideAsync(TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant));
    }

    // -----------------------------------------------------------------------
    // POST /api/approvals/{approvalStepId}/decision — reject
    // -----------------------------------------------------------------------

    /// <summary>
    /// A rejection stops the whole payment and closes every other step, so no one
    /// is left holding a decision that no longer means anything.
    /// </summary>
    [Fact]
    public async Task DecideAsync_Reject_RejectsPaymentAndRemainingSteps()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        var payment = SeedPendingPayment(db, paymentId: 42, amount: 250000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId, stepNumber: 1);
        SeedStep(db, stepId: 502, paymentId: 42, attestantId: OtherAttestantId, stepNumber: 2);

        var service = CreateApprovalService(db);

        var decision = await service.DecideAsync(
            TestIds.Step(501), Reject("Fel mottagare"), TenantId, AttestantId, UserRoles.Attestant);

        Assert.Equal(ApprovalStatuses.Rejected, decision.StepStatus);
        Assert.Equal(PaymentStatuses.Rejected, decision.PaymentStatus);
        Assert.Equal(PaymentStatuses.Rejected, payment.Status);
        Assert.Null(payment.ExecutedAt);

        var steps = await db.ApprovalSteps.Where(s => s.PaymentId == 42).ToListAsync();
        Assert.All(steps, s => Assert.Equal(ApprovalStatuses.Rejected, s.Status));
        Assert.All(steps, s => Assert.NotNull(s.DecidedAt));

        var account = await db.Accounts.FirstAsync(a => a.Id == AccountId);
        Assert.Equal(500000m, account.Balance);

        var audit = Assert.Single(db.AuditEntries.ToList());
        Assert.Equal("REJECT_PAYMENT", audit.Action);
        Assert.Contains("Fel mottagare", audit.Description);
    }

    // -----------------------------------------------------------------------
    // Permissions and state
    // -----------------------------------------------------------------------

    /// <summary>
    /// BUG-011 (IDOR): knowing another attestant's step id is not enough to decide
    /// it. v1 accepted whatever step id came back from a hidden form field.
    /// </summary>
    [Fact]
    public async Task DecideAsync_StepAssignedToAnotherAttestant_ThrowsAccessDenied()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        var payment = SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: OtherAttestantId);

        var service = CreateApprovalService(db);

        await Assert.ThrowsAsync<ApprovalStepAccessDeniedException>(() =>
            service.DecideAsync(TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant));

        var step = await db.ApprovalSteps.FirstAsync(s => s.Id == 501);
        Assert.Equal(ApprovalStatuses.Pending, step.Status);
        Assert.Equal(PaymentStatuses.PendingApproval, payment.Status);
    }

    /// <summary>An admin may still decide any step inside their own tenant.</summary>
    [Fact]
    public async Task DecideAsync_AdminDecidingAnotherAttestantsStep_IsAllowed()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var decision = await service.DecideAsync(TestIds.Step(501), Approve(), TenantId, AdminId, UserRoles.Admin);

        Assert.Equal(ApprovalStatuses.Approved, decision.StepStatus);
        Assert.Equal(PaymentStatuses.Completed, decision.PaymentStatus);
    }

    /// <summary>
    /// Not even an admin reaches into another tenant. The answer is 404 rather than
    /// 403 so the response does not confirm that the step id exists somewhere else.
    /// </summary>
    [Fact]
    public async Task DecideAsync_StepInAnotherTenant_ThrowsNotFound()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m, tenantId: OtherTenantId);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        await Assert.ThrowsAsync<ApprovalStepNotFoundException>(() =>
            service.DecideAsync(TestIds.Step(501), Approve(), TenantId, AdminId, UserRoles.Admin));
    }

    [Fact]
    public async Task DecideAsync_UnknownStep_ThrowsNotFound()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        var service = CreateApprovalService(db);

        await Assert.ThrowsAsync<ApprovalStepNotFoundException>(() =>
            service.DecideAsync(TestIds.Step(999), Approve(), TenantId, AttestantId, UserRoles.Attestant));
    }

    /// <summary>
    /// A step that was already decided is a conflict, not a silent reprocessing.
    /// </summary>
    [Fact]
    public async Task DecideAsync_AlreadyDecidedStep_ThrowsAlreadyDecided()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 42, amount: 250000m);
        SeedStep(
            db,
            stepId: 501,
            paymentId: 42,
            attestantId: AttestantId,
            status: ApprovalStatuses.Approved,
            decidedAt: DateTime.UtcNow);

        var service = CreateApprovalService(db);

        await Assert.ThrowsAsync<ApprovalStepAlreadyDecidedException>(() =>
            service.DecideAsync(TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant));
    }

    /// <summary>
    /// The payment may have moved on even when the step itself still looks pending,
    /// for example because another attestant rejected it.
    /// </summary>
    [Fact]
    public async Task DecideAsync_PaymentNoLongerPending_ThrowsPaymentAlreadyCompleted()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        var payment = SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        payment.Status = PaymentStatuses.Completed;
        db.SaveChanges();

        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        await Assert.ThrowsAsync<PaymentAlreadyCompletedException>(() =>
            service.DecideAsync(TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("godkänn")]
    [InlineData("delete")]
    public async Task DecideAsync_UnknownAction_ThrowsInvalidApprovalAction(string? action)
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var request = new ApprovalDecisionRequestDto { Action = action };

        await Assert.ThrowsAsync<InvalidApprovalActionException>(() =>
            service.DecideAsync(TestIds.Step(501), request, TenantId, AttestantId, UserRoles.Attestant));
    }

    /// <summary>The comment must fit the approval_steps.comment column.</summary>
    [Fact]
    public async Task DecideAsync_CommentLongerThanAllowed_ThrowsCommentTooLong()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var tooLongComment = new string('x', ApprovalService.MaxCommentLength + 1);

        await Assert.ThrowsAsync<ApprovalCommentTooLongException>(() =>
            service.DecideAsync(TestIds.Step(501), Approve(tooLongComment), TenantId, AttestantId, UserRoles.Attestant));
    }

    /// <summary>A comment that exactly fills the column is still accepted.</summary>
    [Fact]
    public async Task DecideAsync_CommentAtTheMaximumLength_IsAccepted()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var comment = new string('x', ApprovalService.MaxCommentLength);

        await service.DecideAsync(TestIds.Step(501), Approve(comment), TenantId, AttestantId, UserRoles.Attestant);

        var step = await db.ApprovalSteps.FirstAsync(s => s.Id == 501);
        Assert.Equal(comment, step.Comment);
    }

    /// <summary>
    /// An empty or whitespace-only comment is stored as null rather than as blank
    /// text, so "no comment" looks the same however the client sent it.
    /// </summary>
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task DecideAsync_WithoutAnActualComment_StoresNull(string? comment)
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        await service.DecideAsync(TestIds.Step(501), Approve(comment), TenantId, AttestantId, UserRoles.Attestant);

        var step = await db.ApprovalSteps.FirstAsync(s => s.Id == 501);
        Assert.Null(step.Comment);

        // Nothing to quote, so the audit line does not end with an empty comment.
        var audit = Assert.Single(db.AuditEntries.ToList());
        Assert.DoesNotContain("Kommentar", audit.Description!);
    }

    /// <summary>
    /// The action is matched case-insensitively and trimmed, so a client sending
    /// "Approve" or a stray space is not rejected over formatting.
    /// </summary>
    [Theory]
    [InlineData("Approve")]
    [InlineData("APPROVE")]
    [InlineData("  approve ")]
    public async Task DecideAsync_ActionCasingAndSpacing_AreTolerated(string action)
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var request = new ApprovalDecisionRequestDto { Action = action };

        var decision = await service.DecideAsync(TestIds.Step(501), request, TenantId, AttestantId, UserRoles.Attestant);

        Assert.Equal(ApprovalStatuses.Approved, decision.StepStatus);
    }

    /// <summary>
    /// An unassigned step (nobody was free when it was created) is not up for grabs
    /// by any attestant who finds it. Only an admin can pick it up.
    /// </summary>
    [Fact]
    public async Task DecideAsync_UnassignedStep_IsRefusedForAnAttestantButAllowedForAnAdmin()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db, balance: 500000m);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: null);

        var service = CreateApprovalService(db);

        await Assert.ThrowsAsync<ApprovalStepAccessDeniedException>(() =>
            service.DecideAsync(TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant));

        var decision = await service.DecideAsync(TestIds.Step(501), Approve(), TenantId, AdminId, UserRoles.Admin);

        Assert.Equal(ApprovalStatuses.Approved, decision.StepStatus);
    }

    /// <summary>
    /// When the tenant has nobody left to take the second step, it is created
    /// without an attestant instead of being handed back to the person who just
    /// approved. An admin sees the whole tenant's inbox and can still act on it.
    /// </summary>
    [Fact]
    public async Task DecideAsync_WhenNoOtherAttestantIsAvailable_CreatesTheStepUnassigned()
    {
        using var db = CreateContext();

        db.Tenants.Add(new Tenant { Id = TenantId, Name = "Malmö Bygg AB" });
        db.Users.AddRange(
            new User { Id = InitiatorId, TenantId = TenantId, Name = "Lisa Persson", Role = UserRoles.Initiator },
            new User { Id = AttestantId, TenantId = TenantId, Name = "Johan Berg", Role = UserRoles.Attestant });

        db.Accounts.Add(new Account
        {
            Id = AccountId,
            TenantId = TenantId,
            AccountName = "Driftkonto",
            Iban = "SE4550000000058398257466",
            Balance = 500000m,
            Currency = "SEK"
        });

        db.SaveChanges();

        SeedPendingPayment(db, paymentId: 42, amount: 300000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var decision = await service.DecideAsync(
            TestIds.Step(501), Approve(), TenantId, AttestantId, UserRoles.Attestant);

        Assert.Equal(PaymentStatuses.PendingApproval, decision.PaymentStatus);

        var secondStep = await db.ApprovalSteps.FirstAsync(s => s.StepNumber == 2);
        Assert.Null(secondStep.AttestantId);
        Assert.Equal(ApprovalStatuses.Pending, secondStep.Status);

        var adminInbox = await service.GetInboxAsync(TenantId, AdminId, UserRoles.Admin);
        Assert.Equal(secondStep.PublicId, Assert.Single(adminInbox.Pending).ApprovalStepId);
    }

    /// <summary>
    /// A step stays out of the inbox once its payment has moved on, even if the
    /// step itself was never decided, for example after another attestant rejected.
    /// </summary>
    [Fact]
    public async Task GetInboxAsync_ExcludesStepsWhosePaymentIsNoLongerPending()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        var payment = SeedPendingPayment(db, paymentId: 42, amount: 75000m);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        payment.Status = PaymentStatuses.Rejected;
        db.SaveChanges();

        var service = CreateApprovalService(db);

        var inbox = await service.GetInboxAsync(TenantId, AttestantId, UserRoles.Attestant);

        Assert.Empty(inbox.Pending);
    }

    /// <summary>The inbox never reaches outside the caller's own tenant.</summary>
    [Fact]
    public async Task GetInboxAsync_ExcludesStepsInAnotherTenant()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 42, amount: 75000m, tenantId: OtherTenantId);
        SeedStep(db, stepId: 501, paymentId: 42, attestantId: AttestantId);

        var service = CreateApprovalService(db);

        var inbox = await service.GetInboxAsync(TenantId, AttestantId, UserRoles.Attestant);

        Assert.Empty(inbox.Pending);
    }

    /// <summary>
    /// recentlyHandled shows the caller's own decisions, newest first, and not
    /// what another attestant decided.
    /// </summary>
    [Fact]
    public async Task GetInboxAsync_ReturnsHandledStepsNewestFirstAndOnlyTheCallersOwn()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        SeedPendingPayment(db, paymentId: 40, amount: 8000m);
        SeedPendingPayment(db, paymentId: 41, amount: 9000m);
        SeedPendingPayment(db, paymentId: 42, amount: 10000m);

        SeedStep(
            db, stepId: 500, paymentId: 40, attestantId: AttestantId,
            status: ApprovalStatuses.Approved,
            decidedAt: new DateTime(2026, 8, 27, 10, 0, 0, DateTimeKind.Utc));

        SeedStep(
            db, stepId: 501, paymentId: 41, attestantId: AttestantId,
            status: ApprovalStatuses.Rejected,
            decidedAt: new DateTime(2026, 8, 29, 14, 0, 0, DateTimeKind.Utc));

        SeedStep(
            db, stepId: 502, paymentId: 42, attestantId: OtherAttestantId,
            status: ApprovalStatuses.Approved,
            decidedAt: new DateTime(2026, 8, 30, 9, 0, 0, DateTimeKind.Utc));

        var service = CreateApprovalService(db);

        var inbox = await service.GetInboxAsync(TenantId, AttestantId, UserRoles.Attestant);

        Assert.Equal(new[] { 41, 40 }, inbox.RecentlyHandled.Select(h => h.PaymentId).ToArray());
        Assert.Equal(ApprovalStatuses.Rejected, inbox.RecentlyHandled[0].Status);
    }

    /// <summary>
    /// "Recently" means the last 50 decisions. The v1 page had the same limit but
    /// never told anyone about it.
    /// </summary>
    [Fact]
    public async Task GetInboxAsync_ReturnsAtMostFiftyHandledSteps()
    {
        using var db = CreateContext();
        SeedUsersAndAccount(db);

        for (var i = 0; i < 60; i++)
        {
            var paymentId = 1000 + i;

            SeedPendingPayment(db, paymentId: paymentId, amount: 8000m);

            SeedStep(
                db,
                stepId: 2000 + i,
                paymentId: paymentId,
                attestantId: AttestantId,
                status: ApprovalStatuses.Approved,
                decidedAt: new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc).AddMinutes(i));
        }

        var service = CreateApprovalService(db);

        var inbox = await service.GetInboxAsync(TenantId, AttestantId, UserRoles.Attestant);

        Assert.Equal(50, inbox.RecentlyHandled.Count);

        // Newest first, so the ten oldest decisions are the ones left out.
        Assert.Equal(1059, inbox.RecentlyHandled[0].PaymentId);
        Assert.Equal(1010, inbox.RecentlyHandled[49].PaymentId);
    }
}