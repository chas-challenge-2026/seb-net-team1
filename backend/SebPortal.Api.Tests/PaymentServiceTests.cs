using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Repositories;
using SebPortal.Api.Models;
using SebPortal.Api.Services;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Options;

namespace SebPortal.Api.Tests;

/// <summary>
/// Tests the US-24 payment completion rules for keeping payment status,
/// account balance, and transaction history consistent.
/// </summary>
public class PaymentServiceTests
{
    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(options);
    }

    private static PaymentService CreatePaymentService(
        SebDbContext db,
        decimal approvalThreshold = 50000m)
    {
        var repository = new PaymentRepository(db);

        var paymentRules = Microsoft.Extensions.Options.Options.Create(
            new PaymentRulesOptions
            {
                ApprovalThreshold = approvalThreshold
            });

        return new PaymentService(repository, paymentRules);
    }

    /// <summary>
    /// Verifies that a valid payment is completed by deducting the account balance,
    /// updating the payment status, setting the execution timestamp, and creating
    /// an account transaction for traceability.
    /// </summary>
    [Fact]
    public void CompletePayment_WhenAccountHasEnoughBalance_CompletesPaymentAndDeductsBalance()
    {
        using var db = CreateContext();
        var service = CreatePaymentService(db);

        var account = new Account
        {
            Id = 1,
            Balance = 1000m
        };

        var payment = new Payment
        {
            Id = 10,
            FromAccountId = 1,
            Amount = 250m,
            Status = PaymentStatuses.PendingApproval
        };

        var result = service.CompletePayment(payment, account);

        Assert.True(result.WasSuccessful);
        Assert.Null(result.ErrorMessage);

        Assert.Equal(750m, account.Balance);
        Assert.Equal(PaymentStatuses.Completed, payment.Status);
        Assert.NotNull(payment.ExecutedAt);

        Assert.Single(account.Transactions);
        Assert.Equal(-250m, account.Transactions.First().Amount);
        Assert.Equal(account.Id, account.Transactions.First().AccountId);
        Assert.Equal("payment", account.Transactions.First().TransactionType);
    }
    /// <summary>
    /// Verifies that a payment is not completed when the account does not have
    /// enough balance, and that no balance, status, timestamp, or transaction
    /// history changes are made.
    /// </summary>
    [Fact]
    public void CompletePayment_WhenAccountHasNotEnoughBalance_DoesNotCompletePaymentOrDeductBalance()
    {
        using var db = CreateContext();
        var service = CreatePaymentService(db);

        var account = new Account
        {
            Id = 1,
            Balance = 100m
        };

        var payment = new Payment
        {
            Id = 10,
            FromAccountId = 1,
            Amount = 250m,
            Status = PaymentStatuses.PendingApproval
        };

        var result = service.CompletePayment(payment, account);

        Assert.False(result.WasSuccessful);
        Assert.NotNull(result.ErrorMessage);
        Assert.Equal(100m, account.Balance);
        Assert.Equal(PaymentStatuses.PendingApproval, payment.Status);
        Assert.Null(payment.ExecutedAt);

        Assert.Empty(account.Transactions);
    }
    /// <summary>
    /// Verifies that an already completed payment cannot be completed again,
    /// preventing the account balance from being deducted twice.
    /// </summary>
    [Fact]
    public void CompletePayment_WhenPaymentIsAlreadyCompleted_DoesNotDeductBalanceAgain()
    {
        using var db = CreateContext();
        var service = CreatePaymentService(db);

        var account = new Account
        {
            Id = 1,
            Balance = 1000m
        };

        var payment = new Payment
        {
            Id = 10,
            FromAccountId = 1,
            Amount = 250m,
            Status = PaymentStatuses.Completed,
            ExecutedAt = DateTime.UtcNow
        };

        var result = service.CompletePayment(payment, account);

        Assert.False(result.WasSuccessful);
        Assert.NotNull(result.ErrorMessage);
        Assert.Equal(1000m, account.Balance);
        Assert.Equal(PaymentStatuses.Completed, payment.Status);
        Assert.NotNull(payment.ExecutedAt);

        Assert.Empty(account.Transactions);
    }

    /// <summary>
    /// Verifies that a payment cannot be completed from an account it does not
    /// belong to, preventing balance changes on the wrong account.
    /// </summary>
    [Fact]
    public void CompletePayment_WhenPaymentDoesNotBelongToAccount_DoesNotCompletePayment()
    {
        using var db = CreateContext();
        var service = CreatePaymentService(db);

        var account = new Account
        {
            Id = 1,
            Balance = 1000m
        };

        var payment = new Payment
        {
            Id = 10,
            FromAccountId = 2,
            Amount = 250m,
            Status = PaymentStatuses.PendingApproval
        };

        var result = service.CompletePayment(payment, account);

        Assert.False(result.WasSuccessful);
        Assert.NotNull(result.ErrorMessage);
        Assert.Equal(1000m, account.Balance);
        Assert.Equal(PaymentStatuses.PendingApproval, payment.Status);
        Assert.Null(payment.ExecutedAt);

        Assert.Empty(account.Transactions);
    }
    [Fact]
    public async Task CreatePaymentAsync_ThrowsException_WhenAccountNotFound()
    {
        using var db = CreateContext();
        var service = CreatePaymentService(db);

        await Assert.ThrowsAsync<AccountNotFoundException>(() =>
            service.CreatePaymentAsync(
                tenantId: 1,
                fromAccountId: 1,
                toIban: "SE4550000000054910000099",
                amount: 250m,
                currency: "SEK",
                reference: "Testbetalning",
                createdById: 1));
    }
    [Fact]
    public async Task CreatePaymentAsync_CreatesPendingPayment_WhenApprovalIsRequired()
    {
        using var db = CreateContext();

        db.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Företagskonto",
            Iban = "SE3550000000054910000003",
            Balance = 100000m,
            Currency = "SEK"
        });

        await db.SaveChangesAsync();

        var service = CreatePaymentService(db);

        var result = await service.CreatePaymentAsync(
            tenantId: 1,
            fromAccountId: 1,
            toIban: "SE4550000000054910000099",
            amount: 50001m,
            currency: "SEK",
            reference: "Testbetalning",
            createdById: 1);

        Assert.NotNull(result);
        Assert.Equal(PaymentStatuses.PendingApproval, result.Status);
        Assert.Equal(50001m, result.Amount);
        Assert.Equal("SEK", result.Currency);

        Assert.Single(db.Payments);
    }

    [Theory]
    [InlineData(49999)]
    [InlineData(50000)]
    public async Task CreatePaymentAsync_CompletesPaymentImmediately_WhenAmountIsAtOrBelowThreshold(
        decimal amount)
    {
        using var db = CreateContext();

        db.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Företagskonto",
            Iban = "SE3550000000054910000003",
            Balance = 100000m,
            Currency = "SEK"
        });

        await db.SaveChangesAsync();

        var service = CreatePaymentService(db);

        var result = await service.CreatePaymentAsync(
            tenantId: 1,
            fromAccountId: 1,
            toIban: "SE4550000000054910000099",
            amount: amount,
            currency: "SEK",
            reference: "Direktbetalning",
            createdById: 1);

        Assert.NotNull(result);
        Assert.Equal(PaymentStatuses.Completed, result.Status);
        Assert.NotNull(result.ExecutedAt);

        var account = await db.Accounts
            .Include(a => a.Transactions)
            .FirstAsync(a => a.Id == 1);

        Assert.Equal(100000m - amount, account.Balance);

        Assert.Single(account.Transactions);
        Assert.Equal(-amount, account.Transactions.First().Amount);
        Assert.Equal("payment", account.Transactions.First().TransactionType);

        Assert.Single(db.Payments);
    }
    [Fact]
    public async Task CreatePaymentAsync_ThrowsException_WhenAccountHasInsufficientFunds()
    {
        using var db = CreateContext();

        db.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Företagskonto",
            Iban = "SE3550000000054910000003",
            Balance = 100m,
            Currency = "SEK"
        });

        await db.SaveChangesAsync();

        var service = CreatePaymentService(db);

        await Assert.ThrowsAsync<InsufficientFundsException>(() =>
            service.CreatePaymentAsync(
                tenantId: 1,
                fromAccountId: 1,
                toIban: "SE4550000000054910000099",
                amount: 250m,
                currency: "SEK",
                reference: "Testbetalning",
                createdById: 1));

        Assert.Empty(db.Payments);

        var account = await db.Accounts
            .Include(a => a.Transactions)
            .FirstAsync(a => a.Id == 1);

        Assert.Equal(100m, account.Balance);

        Assert.Empty(account.Transactions);
    }
}
