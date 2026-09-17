using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using Microsoft.Extensions.Options;
using SebPortal.Api.Options;

namespace SebPortal.Api.Services;

public class PaymentService(PaymentRepository paymentRepository, IOptions<PaymentRulesOptions> paymentRules)
{
    /// <summary>
    /// Creates a payment, validates the source account and tenant,
    /// and uses the configured approval threshold to either complete the payment
    /// immediately or leave it pending approval.
    /// </summary>
    public async Task<Payment> CreatePaymentAsync(
        int tenantId,
        int fromAccountId,
        string toIban,
        decimal amount,
        string currency,
        string? reference,
        int? createdById)
    {
        // 1. Look for the right account or tenant
        var account = await paymentRepository.GetAccountAsync(fromAccountId, tenantId);

        if (account is null)
        {
            // AccountNotFoundException on purpose here, not an access-denied exception:
            // GetAccountAsync filters by (id AND tenantId) in one query, so we genuinely
            // can't tell "doesn't exist" apart from "belongs to another tenant". Returning
            // the same NotFound response for both avoids leaking that distinction across tenants.
            throw new AccountNotFoundException(fromAccountId);
        }

        // 2. Create the payment
        var payment = new Payment
        {
            TenantId = tenantId,
            FromAccountId = fromAccountId,
            ToIban = toIban,
            Amount = amount,
            Currency = currency,
            Reference = reference,
            CreatedById = createdById,
            CreatedAt = DateTime.UtcNow,
            Status = PaymentStatuses.PendingApproval
        };

        // 3. Determine the payment flow from the configured approval threshold.
        var requiresApproval = amount > paymentRules.Value.ApprovalThreshold;

        if (!requiresApproval)
        {
            var result = CompletePayment(payment, account);

            if (!result.WasSuccessful)
            {
                throw result.FailureReason switch
                {
                    CompletePaymentFailureReason.InvalidAmount =>
                        new InvalidPaymentAmountException(payment.Amount),
                    CompletePaymentFailureReason.InsufficientFunds =>
                        new InsufficientFundsException(payment.Amount, account.Balance),
                    CompletePaymentFailureReason.AlreadyCompleted =>
                        new PaymentAlreadyCompletedException(payment.Id, payment.Status),
                    CompletePaymentFailureReason.WrongAccount =>
                        new PaymentAccountMismatchException(payment.FromAccountId, account.Id),
                    _ => new InvalidOperationException(result.ErrorMessage)
                };
            }
        }

        // 4. Persist the payment together with any balance and transaction changes.
        await paymentRepository.AddPaymentAsync(payment);

        return payment;
    }

    /// <summary>
    /// Attempts to complete a payment by keeping the payment status, account balance,
    /// execution timestamp and transaction history updated together.
    /// </summary>
    /// <param name="payment">The payment that should be completed.</param>
    /// <param name="account">The account the payment should be withdrawn from.</param>
    /// <returns>
    /// A result that indicates whether the payment was completed, and contains an
    /// error message when the payment could not be completed.
    /// </returns>
    public CompletePaymentResult CompletePayment(Payment payment, Account account)
    {
        if (payment.FromAccountId != account.Id)
        {
            return new CompletePaymentResult
            {
                WasSuccessful = false,
                ErrorMessage = "The payment does not belong to the provided account.",
                FailureReason = CompletePaymentFailureReason.WrongAccount
            };
        }
        if (payment.Status == PaymentStatuses.Completed)
        {
            return new CompletePaymentResult
            {
                WasSuccessful = false,
                ErrorMessage = "This payment has already been completed.",
                FailureReason = CompletePaymentFailureReason.AlreadyCompleted
            };
        }
        if (payment.Amount <= 0)
        {
            return new CompletePaymentResult
            {
                WasSuccessful = false,
                ErrorMessage = "The payment Amount is less than or equal to 0.",
                FailureReason = CompletePaymentFailureReason.InvalidAmount
            };
        }
        if (account.Balance < payment.Amount)
        {
            return new CompletePaymentResult
            {
                WasSuccessful = false,
                ErrorMessage = "The account has insufficient funds.",
                FailureReason = CompletePaymentFailureReason.InsufficientFunds
            };
        }

        account.Balance -= payment.Amount;
        payment.Status = PaymentStatuses.Completed;
        payment.ExecutedAt = DateTime.UtcNow;

        account.Transactions.Add(new Transaction
        {
            AccountId = account.Id,
            Amount = -payment.Amount,
            Date = payment.ExecutedAt.Value,
            Description = payment.Reference,
            TransactionType = "payment"
        });

        return new CompletePaymentResult
        {
            WasSuccessful = true
        };
    }
}
