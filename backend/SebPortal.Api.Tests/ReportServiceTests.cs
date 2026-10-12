using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;

namespace SebPortal.Api.Tests;

public class ReportServiceTests
{
    private static SebDbContext CreateContext() => new(
        new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Theory]
    [InlineData(null, "2026-10-08")]
    [InlineData("2026-10-01", null)]
    [InlineData("2026-02-29", "2026-10-08")]
    [InlineData("2026-10-09", "2026-10-08")]
    public async Task GetPaymentsAsync_ValidatesPeriodForDirectCallers(string? from, string? to)
    {
        using var db = CreateContext();
        var service = new ReportService(new ReportRepository(db));
        await Assert.ThrowsAsync<InvalidReportPeriodException>(() =>
            service.GetPaymentsAsync(1, 1, from, to));
    }

    [Fact]
    public async Task GetPaymentsAsync_IsReadOnlyAndFormatsMoneyIndependentlyOfCulture()
    {
        using var db = CreateContext();
        db.Users.Add(new User { Id = 1, TenantId = 1, Role = UserRoles.Attestant });
        db.Accounts.Add(new Account { Id = 1, TenantId = 1, AccountName = "Driftkonto", Balance = 1000m });
        db.Payments.Add(new Payment
        {
            Id = 1, TenantId = 1, FromAccountId = 1, Amount = 1234.5m,
            Status = PaymentStatuses.PendingApproval,
            CreatedAt = new DateTime(2026, 10, 8, 12, 0, 0, DateTimeKind.Unspecified)
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var originalCulture = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("sv-SE");
            var service = new ReportService(new ReportRepository(db));
            var report = await service.GetPaymentsAsync(1, 1, "2026-10-08", "2026-10-08");
            var row = Assert.Single(report!.Payments);
            Assert.Equal("1234.50", row.Amount);
            Assert.Equal(DateTimeKind.Utc, row.CreatedAt.Kind);
            Assert.Empty(db.ChangeTracker.Entries());
            Assert.Equal(1000m, await db.Accounts.AsNoTracking().Select(a => a.Balance).SingleAsync());
            Assert.Equal(PaymentStatuses.PendingApproval,
                await db.Payments.AsNoTracking().Select(p => p.Status).SingleAsync());
            Assert.Empty(await db.Transactions.AsNoTracking().ToListAsync());
            Assert.Empty(await db.AuditEntries.AsNoTracking().ToListAsync());
        }
        finally
        {
            CultureInfo.CurrentCulture = originalCulture;
        }
    }

    [Fact]
    public async Task GetPaymentsAsync_HonorsCancellation()
    {
        using var db = CreateContext();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var service = new ReportService(new ReportRepository(db));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.GetPaymentsAsync(1, 1, "2026-10-01", "2026-10-08", cancellation.Token));
    }
}
