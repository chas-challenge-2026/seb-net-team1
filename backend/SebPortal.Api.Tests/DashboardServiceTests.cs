using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using Xunit;

namespace SebPortal.Api.Tests;

public class DashboardServiceTests
{
    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()) // fresh DB per test
            .Options;

        return new SebDbContext(options);
    }

    private static void SeedBasicTenantAndUser(SebDbContext db, string role = "attestant")
    {
        db.Tenants.Add(new Tenant { Id = 1, Name = "Runö Bygg AB" });
        db.Users.Add(new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Papper Pappersson",
            Email = "papper@runobygg.se",
            Role = role
        });
        db.SaveChanges();
    }

    [Fact]
    public async Task GetDashboardAsync_ReturnsNull_WhenUserNotFound()
    {
        // Arrange: empty database, no matching user
        using var db = CreateContext();
        var service = new DashboardService(new DashboardRepository(db));

        // Act
        var result = await service.GetDashboardAsync(tenantId: 1, userId: 1);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task GetDashboardAsync_ReturnsTenantAndUserInfo_WhenFound()
    {
        // Arrange
        using var db = CreateContext();
        SeedBasicTenantAndUser(db);
        var service = new DashboardService(new DashboardRepository(db));

        // Act
        var result = await service.GetDashboardAsync(tenantId: 1, userId: 1);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("Runö Bygg AB", result!.TenantName);
        Assert.Equal("Papper Pappersson", result.User!.Name);
    }

    [Fact]
    public async Task GetDashboardAsync_PopulatesPendingApprovals_ForAttestant()
    {
        // Arrange
        using var db = CreateContext();
        SeedBasicTenantAndUser(db, role: "attestant");
        db.Payments.Add(new Payment
        {
            Id = 1,
            TenantId = 1,
            FromAccountId = 1,
            ToIban = "SE4550000000054910000099",
            Amount = 8000m,
            Reference = "Löner september",
            Status = "pending_approval"
        });
        db.ApprovalSteps.Add(new ApprovalStep
        {
            Id = 1,
            PaymentId = 1,
            AttestantId = 1,
            StepNumber = 1,
            Status = "pending"
        });
        db.SaveChanges();
        var service = new DashboardService(new DashboardRepository(db));

        // Act
        var result = await service.GetDashboardAsync(tenantId: 1, userId: 1);

        // Assert
        Assert.NotNull(result);
        Assert.Single(result!.PendingApprovals);
        Assert.Equal("8000.00", result.PendingApprovals[0].Amount);
    }

    [Fact]
    public async Task GetDashboardAsync_LeavesPendingApprovalsEmpty_ForInitiator()
    {
        // Arrange: same payment/step setup, but user role is "initiator"
        using var db = CreateContext();
        SeedBasicTenantAndUser(db, role: "initiator");
        db.Payments.Add(new Payment
        {
            Id = 1,
            TenantId = 1,
            FromAccountId = 1,
            ToIban = "SE4550000000054910000099",
            Amount = 8000m,
            Status = "pending_approval"
        });
        db.ApprovalSteps.Add(new ApprovalStep
        {
            Id = 1,
            PaymentId = 1,
            AttestantId = 1,
            StepNumber = 1,
            Status = "pending"
        });
        db.SaveChanges();
        var service = new DashboardService(new DashboardRepository(db));

        // Act
        var result = await service.GetDashboardAsync(tenantId: 1, userId: 1);

        // Assert
        Assert.NotNull(result);
        Assert.Empty(result!.PendingApprovals);
    }

    [Fact]
    public async Task GetDashboardAsync_FormatsMoneyAsInvariantDecimalStrings()
    {
        // Arrange
        using var db = CreateContext();
        SeedBasicTenantAndUser(db);
        db.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Företagskonto",
            Iban = "SE3550000000054910000003",
            Balance = 245000.50m,
            Currency = "SEK"
        });
        db.SaveChanges();
        var service = new DashboardService(new DashboardRepository(db));

        // Act
        var result = await service.GetDashboardAsync(tenantId: 1, userId: 1);

        // Assert: period decimal separator, not comma, and a parseable decimal
        Assert.NotNull(result);
        var balance = result!.Accounts[0].Balance;
        Assert.Equal("245000.50", balance);
        Assert.True(decimal.TryParse(
            balance,
            System.Globalization.NumberStyles.Any,
            System.Globalization.CultureInfo.InvariantCulture,
            out _));
    }
}