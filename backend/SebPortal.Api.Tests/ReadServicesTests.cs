using System.Text;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;

namespace SebPortal.Api.Tests;

/// <summary>Accounts, reports and payment export/detail: the read side of the API.</summary>
public class ReadServicesTests
{
    private static SebDbContext Seed()
    {
        var db = TestServices.CreateContext();
        db.Tenants.AddRange(new Tenant { Id = 1, Name = "Malmö Bygg AB" }, new Tenant { Id = 2, Name = "Annat AB" });
        db.Users.AddRange(
            new User { Id = 1, TenantId = 1, Name = "Lisa Persson", Email = "lisa@malmobygg.se", Role = UserRoles.Initiator },
            new User { Id = 2, TenantId = 1, Name = "Johan Berg", Email = "johan@malmobygg.se", Role = UserRoles.Attestant },
            new User { Id = 9, TenantId = 2, Name = "Främling", Email = "x@annat.se", Role = UserRoles.Initiator });
        db.Accounts.AddRange(
            new Account { Id = 1, TenantId = 1, AccountName = "Driftkonto", Iban = "SE4550000000058398257466", Balance = 100_000m },
            new Account { Id = 2, TenantId = 2, AccountName = "Deras konto", Iban = "SE1850000000058398257467", Balance = 5_000m });

        var now = DateTime.UtcNow;
        db.Payments.AddRange(
            new Payment { Id = 1, TenantId = 1, FromAccountId = 1, ToIban = "SE3550000000054910000003", Amount = 1_000m, Reference = "=cmd|' /C calc'!A0", Status = PaymentStatuses.Completed, CreatedById = 1, CreatedAt = now.AddMonths(-1) },
            new Payment { Id = 2, TenantId = 1, FromAccountId = 1, ToIban = "SE3550000000054910000003", Amount = 60_000m, Reference = "Väntar; med semikolon", Status = PaymentStatuses.PendingApproval, CreatedById = 1, CreatedAt = now },
            new Payment { Id = 3, TenantId = 1, FromAccountId = 1, ToIban = "SE0850000000054910000004", Amount = 2_500m, Reference = "Avvisad", Status = PaymentStatuses.Rejected, CreatedById = 1, CreatedAt = now },
            new Payment { Id = 4, TenantId = 2, FromAccountId = 2, ToIban = "SE3550000000054910000003", Amount = 999m, Reference = "Annan tenant", Status = PaymentStatuses.Completed, CreatedById = 9, CreatedAt = now });
        db.ApprovalSteps.Add(new ApprovalStep { Id = 1, PaymentId = 2, AttestantId = 2, StepNumber = 1, Status = ApprovalStatuses.Pending });
        db.SaveChanges();
        return db;
    }

    [Fact]
    public async Task Accounts_ReportReservedAndAvailableBalance()
    {
        using var db = Seed();
        var service = new AccountService(db, new DashboardRepository(db));

        var account = Assert.Single(await service.GetAccountsAsync(1));

        Assert.Equal("100000.00", account.Balance);
        Assert.Equal("60000.00", account.ReservedAmount);
        Assert.Equal("40000.00", account.AvailableBalance);
        Assert.Equal(1, account.PendingPaymentCount);
    }

    [Fact]
    public async Task Accounts_OfAnotherTenant_AreNotFound()
    {
        using var db = Seed();
        var service = new AccountService(db, new DashboardRepository(db));

        await Assert.ThrowsAsync<AccountNotFoundException>(() => service.GetAccountAsync(1, 2));
        await Assert.ThrowsAsync<AccountNotFoundException>(() => service.GetTransactionsAsync(1, 2, 1, 20));
    }

    [Fact]
    public async Task Report_HasOneBucketPerMonth_AndOnlyTheTenantsPayments()
    {
        using var db = Seed();

        var report = await new ReportService(db).GetSummaryAsync(1, months: 3);

        Assert.Equal(3, report.Months.Count);
        Assert.Equal(DateTime.UtcNow.ToString("yyyy-MM"), report.Months[^1].Month);
        Assert.Equal("1000.00", report.Months[^2].CompletedAmount);
        Assert.Equal(1, report.Months[^1].PendingCount);
        Assert.Equal(1, report.Months[^1].RejectedCount);

        var completed = report.ByStatus.Single(s => s.Status == PaymentStatuses.Completed);
        Assert.Equal(1, completed.Count); // tenant 2's payment is not counted

        var top = Assert.Single(report.TopRecipients);
        Assert.Equal("SE3550000000054910000003", top.ToIban);
    }

    [Fact]
    public async Task Export_EscapesFormulasAndSeparators_AndIsTenantScoped()
    {
        using var db = Seed();
        var service = new PaymentQueryService(db, TestServices.PaymentService(db));

        var bytes = await service.ExportCsvAsync(1, 1, new PaymentListQuery());
        var csv = Encoding.UTF8.GetString(bytes);

        Assert.StartsWith("﻿", csv);                        // BOM for Excel
        Assert.Contains("'=cmd|' /C calc'!A0", csv);             // formula neutralized
        Assert.Contains("\"Väntar; med semikolon\"", csv);        // separator quoted
        Assert.Contains("60000,00", csv);                        // Swedish decimal comma
        Assert.DoesNotContain("Annan tenant", csv);
        Assert.Equal(4, csv.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length); // header + 3
    }

    [Fact]
    public async Task Detail_TellsTheAssignedAttestantWhichStepTheyMayDecide()
    {
        using var db = Seed();
        var service = new PaymentQueryService(db, TestServices.PaymentService(db));

        var forJohan = await service.GetDetailAsync(1, 2, UserRoles.Attestant, 2);
        var forLisa = await service.GetDetailAsync(1, 1, UserRoles.Initiator, 2);

        Assert.Equal(1, forJohan.MyApprovalStepId);
        Assert.Null(forLisa.MyApprovalStepId);   // her own payment
        Assert.True(forJohan.RequiresApproval);
        Assert.Equal("Johan Berg", Assert.Single(forJohan.ApprovalSteps).AttestantName);

        await Assert.ThrowsAsync<PaymentNotFoundException>(() => service.GetDetailAsync(1, 1, UserRoles.Initiator, 4));
    }

    [Fact]
    public async Task List_SearchesReferenceIbanAndId()
    {
        using var db = Seed();
        var service = new PaymentQueryService(db, TestServices.PaymentService(db));

        var byReference = await service.ListAsync(1, 1, new PaymentListQuery { Search = "semikolon" });
        var byIban = await service.ListAsync(1, 1, new PaymentListQuery { Search = "se08 5000" });
        var byId = await service.ListAsync(1, 1, new PaymentListQuery { Search = "#3" });

        Assert.Equal(2, Assert.Single(byReference.Items).Id);
        Assert.Equal(3, Assert.Single(byIban.Items).Id);
        Assert.Equal(3, Assert.Single(byId.Items).Id);
    }
}
