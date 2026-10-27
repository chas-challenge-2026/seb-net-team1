using System.Text;
using SebPortal.Api.Data;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>
/// CSV batch payments: every row validated like a single payment, and all or
/// nothing (BUG-005: v1 committed rows one by one without a transaction).
/// </summary>
public class BatchPaymentServiceTests
{
    private const string Header = "from_account_id,to_iban,amount,reference";

    private static SebDbContext Seed(decimal balance = 100_000m)
    {
        var db = TestServices.CreateContext();
        db.Tenants.Add(new Tenant { Id = 1, Name = "Malmö Bygg AB" });
        db.Users.AddRange(
            new User { Id = 1, TenantId = 1, Name = "Lisa Persson", Email = "lisa@malmobygg.se", Role = UserRoles.Initiator },
            new User { Id = 2, TenantId = 1, Name = "Johan Berg", Email = "johan@malmobygg.se", Role = UserRoles.Attestant });
        db.Accounts.Add(new Account { Id = 1, TenantId = 1, AccountName = "Driftkonto", Iban = "SE4550000000058398257466", Balance = balance });
        db.SaveChanges();
        return db;
    }

    private static byte[] Csv(params string[] rows) => Encoding.UTF8.GetBytes(string.Join("\n", rows.Prepend(Header)));

    [Fact]
    public async Task CreateAsync_CreatesEveryRow_CompletingSmallOnesAndSendingLargeOnesForAttest()
    {
        using var db = Seed();
        var service = TestServices.BatchService(db);

        var result = await service.CreateAsync(1, 1, "betalningar.csv", Csv(
            "1,SE3550000000054910000003,5000.00,\"Malmö Bygg, faktura 99\"",
            "1,SE0850000000054910000004,60000.00,Maskinhyra"), idempotencyKey: null);

        Assert.Equal(2, result.CreatedCount);
        Assert.Equal(1, result.CompletedCount);
        Assert.Equal(1, result.PendingApprovalCount);
        Assert.Equal("65000.00", result.TotalAmount);

        Assert.All(db.Payments, p => Assert.Equal(PaymentSources.Batch, p.Source));
        Assert.Equal("Malmö Bygg, faktura 99", db.Payments.Single(p => p.Amount == 5000m).Reference);
        Assert.Equal(95_000m, db.Accounts.Single().Balance);

        var step = Assert.Single(db.ApprovalSteps);
        Assert.Equal(2, step.AttestantId);

        Assert.Equal(2, db.AuditEntries.Count(e => e.Action == AuditActions.CreatePayment));
        Assert.Single(db.AuditEntries, e => e.Action == AuditActions.BatchUpload);
        Assert.Single(db.Notifications, n => n.RecipientUserId == 2 && n.Type == NotificationTypes.ApprovalRequested);
    }

    [Fact]
    public async Task CreateAsync_CreatesNothing_WhenOneRowIsInvalid()
    {
        using var db = Seed();
        var service = TestServices.BatchService(db);

        var exception = await Assert.ThrowsAsync<BatchValidationException>(() => service.CreateAsync(1, 1, "betalningar.csv", Csv(
            "1,SE3550000000054910000003,5000.00,Rad 2 är giltig",
            "1,SE8550000000054910000003,5000.00,Fel kontrollsiffror",
            "1,SE0850000000054910000004,abc,Ogiltigt belopp"), idempotencyKey: null));

        var validation = Assert.IsType<DTOs.BatchValidationResponse>(exception.Extensions!["validation"]);
        Assert.Equal(3, validation.RowCount);
        Assert.Equal(2, validation.InvalidRowCount);
        Assert.Empty(validation.Rows[0].Errors);
        Assert.Contains(validation.Rows[1].Errors, e => e.Contains("MOD97"));
        Assert.Contains(validation.Rows[2].Errors, e => e.Contains("Ogiltigt belopp"));

        Assert.Empty(db.Payments);
        Assert.Empty(db.AuditEntries);
        Assert.Equal(100_000m, db.Accounts.Single().Balance);
    }

    [Fact]
    public async Task ValidateAsync_CountsEarlierRowsAgainstTheAvailableBalance()
    {
        using var db = Seed(balance: 10_000m);
        var service = TestServices.BatchService(db);

        var validation = await service.ValidateAsync(1, "betalningar.csv", Csv(
            "1,SE3550000000054910000003,6000.00,Första",
            "1,SE0850000000054910000004,6000.00,Andra får inte plats"));

        Assert.Empty(validation.Rows[0].Errors);
        Assert.Contains(validation.Rows[1].Errors, e => e.Contains("Otillräckligt"));
        Assert.False(validation.IsValid);
    }

    [Fact]
    public async Task ValidateAsync_RejectsUnknownAccountAndOtherTenantsAccount()
    {
        using var db = Seed();
        db.Tenants.Add(new Tenant { Id = 2, Name = "Annat AB" });
        db.Accounts.Add(new Account { Id = 2, TenantId = 2, AccountName = "Deras konto", Iban = "SE1850000000058398257467", Balance = 1_000_000m });
        db.SaveChanges();
        var service = TestServices.BatchService(db);

        var validation = await service.ValidateAsync(1, "betalningar.csv", Csv(
            "2,SE3550000000054910000003,100.00,Annan tenant",
            "99,SE3550000000054910000003,100.00,Finns inte"));

        Assert.All(validation.Rows, row => Assert.Contains(row.Errors, e => e.Contains("finns inte")));
    }

    [Fact]
    public async Task ValidateAsync_RejectsFilesOverTheSizeLimit()
    {
        using var db = Seed();
        var service = TestServices.BatchService(db);
        var tooLarge = new byte[1024 * 1024 + 1];

        var validation = await service.ValidateAsync(1, "stor.csv", tooLarge);

        Assert.Contains(validation.FileErrors, e => e.Contains("för stor"));
        Assert.Empty(validation.Rows);
    }

    [Fact]
    public async Task CreateAsync_WithSameIdempotencyKey_DoesNotCreateTheBatchTwice()
    {
        using var db = Seed();
        var service = TestServices.BatchService(db);
        var file = Csv("1,SE3550000000054910000003,100.00,A", "1,SE0850000000054910000004,200.00,B");

        var first = await service.CreateAsync(1, 1, "a.csv", file, idempotencyKey: "batch-key-1");
        var second = await service.CreateAsync(1, 1, "a.csv", file, idempotencyKey: "batch-key-1");

        Assert.Equal(2, first.CreatedCount);
        Assert.Equal(first.Payments.Select(p => p.Id), second.Payments.Select(p => p.Id));
        Assert.Equal(2, db.Payments.Count());
    }
}
