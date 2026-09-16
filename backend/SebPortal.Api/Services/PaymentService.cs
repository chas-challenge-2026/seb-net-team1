using SebPortal.Api.Models;
using SebPortal.Api.DTOs;

namespace SebPortal.Api.Services;

public class PaymentService
{
    /// <summary>
    /// Creates the initial payment model from the incoming API request.
    /// The IBAN is normalized and the payment starts with pending approval status.
    /// </summary>
    /// <param name="request">The payment data sent from the API layer.</param>
    /// <returns>A new payment model ready to be handled by the payment flow.</returns>
    public Payment CreatePayment(CreatePaymentRequestDto request)
    {
        var toIban = request.ToIban.Trim().Replace(" ", "");

        return new Payment
        {
            Id = 1, // Temporary placeholder until payments are persisted in the database.
            FromAccountId = request.FromAccountId,
            ToIban = toIban,
            Amount = request.Amount,
            Currency = "SEK",
            Reference = request.Reference,
            Status = PaymentStatuses.PendingApproval,
            CreatedAt = DateTime.UtcNow
        };
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
