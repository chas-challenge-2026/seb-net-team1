using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Auditing;
using SebPortal.Api.Data;
using SebPortal.Api.Notifications;
using SebPortal.Api.Options;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Validation;

namespace SebPortal.Api.Tests;

/// <summary>
/// Builds the real services on top of an in-memory database, so unit tests do not
/// have to repeat every constructor dependency.
/// </summary>
internal static class TestServices
{
    public const string AuditKey = "unit-test-audit-signing-key-0123456789abcdef";

    public static SebDbContext CreateContext(bool withAuditChain = false, NotificationQueue? queue = null)
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(
            options,
            withAuditChain ? new AuditChainInterceptor(KeyProvider()) : null,
            queue is null ? null : new NotificationOutboxInterceptor(queue));
    }

    public static AuditSigningKeyProvider KeyProvider() => new(AuditKey);

    public static Microsoft.Extensions.Options.IOptions<PaymentRulesOptions> Rules(
        decimal approvalThreshold = 50000m,
        decimal doubleApprovalThreshold = 200000m) =>
        Microsoft.Extensions.Options.Options.Create(new PaymentRulesOptions
        {
            ApprovalThreshold = approvalThreshold,
            DoubleApprovalThreshold = doubleApprovalThreshold
        });

    public static PaymentService PaymentService(
        SebDbContext db,
        decimal approvalThreshold = 50000m,
        decimal doubleApprovalThreshold = 200000m) =>
        new(
            new PaymentRepository(db),
            Rules(approvalThreshold, doubleApprovalThreshold),
            new IbanValidator(preferNative: false),
            ApprovalAssignment(db),
            new UnitOfWork(db));

    public static ApprovalAssignmentService ApprovalAssignment(SebDbContext db) =>
        new(new ApprovalRepository(db), new NotificationService(db));

    public static ApprovalService ApprovalService(
        SebDbContext db,
        decimal approvalThreshold = 50000m,
        decimal doubleApprovalThreshold = 200000m) =>
        new(
            new ApprovalRepository(db),
            PaymentService(db, approvalThreshold, doubleApprovalThreshold),
            ApprovalAssignment(db),
            new NotificationService(db));

    public static Controllers.PaymentsController PaymentsController(SebDbContext db)
    {
        var paymentService = PaymentService(db);
        return new Controllers.PaymentsController(
            paymentService,
            new PaymentQueryService(db, paymentService),
            BatchService(db, paymentService));
    }

    public static Batch.BatchPaymentService BatchService(SebDbContext db, PaymentService? paymentService = null) =>
        new(
            new Batch.CsvPaymentParser(preferNative: false),
            new PaymentRepository(db),
            paymentService ?? PaymentService(db),
            ApprovalAssignment(db),
            new UnitOfWork(db),
            Microsoft.Extensions.Options.Options.Create(new BatchOptions()));

    public static AuditLogService AuditLogService(SebDbContext db) =>
        new(new AuditLogRepository(db), KeyProvider());
}
