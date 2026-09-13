using SebPortal.Api.Models;
using SebPortal.Api.Services;

namespace SebPortal.Api.Tests;

/// <summary>
/// Tests the US-24 payment completion rules for keeping payment status,
/// account balance, and transaction history consistent.
/// </summary>
public class PaymentServiceTests
{
    /// <summary>
    /// Verifies that a valid payment is completed by deducting the account balance,
    /// updating the payment status, setting the execution timestamp, and creating
    /// an account transaction for traceability.
    /// </summary>
    [Fact]
    public void CompletePayment_WhenAccountHasEnoughBalance_CompletesPaymentAndDeductsBalance()
    {
        var service = new PaymentService();

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
        var service = new PaymentService();

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
        var service = new PaymentService();

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
        var service = new PaymentService();

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
}