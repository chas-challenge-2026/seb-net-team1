using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class PaymentService(PaymentRepository paymentRepository)
{
    /// <summary>
    /// Creates a payment, validates the source account and tenant,
    /// and either completes the payment or leaves it pending approval.
    /// </summary>
    public async Task<Payment> CreatePaymentAsync(
        int tenantId,
        int fromAccountId,
        string toIban,
        decimal amount,
        string currency,
        string? reference,
        int? createdById,
        bool requiresApproval) // bool right now, could be changed to so that you instead need
    {
        // 1. Look for the right account or tenant
        var account = await paymentRepository.GetAccountAsync(fromAccountId, tenantId);

        if (account is null)
        {
            throw new InvalidOperationException("Account could not be found or the the tenant might be wrong");
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
            Status = PaymentStatuses.PendingApproval //a
        };

        // 3. Checks if attest is needed ---------- right now you yourself says if its true or false
        if (!requiresApproval)
        {
            var result = CompletePayment(payment, account);

            if (!result.WasSuccessful)
            {
                throw new InvalidOperationException(result.ErrorMessage);
            }
        }

        // 4. Saves the logic to be able to send money in the next step
        await paymentRepository.AddPaymentAsync(payment);

        return payment;
    }
    /// <summary>
    /// Attempts to complete a payment by keeping the payment status and account
    /// balance update together. The payment should only be completed if it belongs
    /// to the provided account and has not already been completed.
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
                ErrorMessage = "The payment does not belong to the provided account."
            };
        }
        if (payment.Status == PaymentStatuses.Completed)
        {
            return new CompletePaymentResult
            {
                WasSuccessful = false,
                ErrorMessage = "This payment has already been completed."
            };
        }
        if (payment.Amount <= 0)
        {
            return new CompletePaymentResult
            {
                WasSuccessful = false,
                ErrorMessage = "The payment Amount is less than or equal to 0."
            };
        }
        if (account.Balance < payment.Amount)
        {
            return new CompletePaymentResult
            {
                WasSuccessful = false,
                ErrorMessage = "The account has insufficient funds."
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