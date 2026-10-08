using System.Globalization;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using Microsoft.Extensions.Options;
using SebPortal.Api.Options;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace SebPortal.Api.Services;

public class PaymentService(
    PaymentRepository paymentRepository,
    ApprovalRepository approvalRepository,
    IOptions<PaymentRulesOptions> paymentRules,
    AuditService auditService)
{
    private const string IdempotencyIndexName =
        "ux_payments_tenant_creator_idempotency";

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
        int? createdById,
        string? idempotencyKey = null)
    {
        // Check whether this user has already created a payment
        // with the same idempotency key.
        var normalizedIdempotencyKey =
            string.IsNullOrWhiteSpace(idempotencyKey)
                ? null
                : idempotencyKey.Trim();

        if (normalizedIdempotencyKey?.Length >
            Payment.MaxIdempotencyKeyLength)
        {
            throw new InvalidIdempotencyKeyException(
                Payment.MaxIdempotencyKeyLength);
        }

        var existingPayment = await FindExistingIdempotentPaymentAsync(
            tenantId,
            fromAccountId,
            toIban,
            amount,
            currency,
            reference,
            createdById,
            normalizedIdempotencyKey);

        if (existingPayment is not null)
        {
            return existingPayment;
        }

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
            IdempotencyKey = normalizedIdempotencyKey,
            CreatedAt = DateTime.UtcNow,
            Status = PaymentStatuses.PendingApproval
        };

        // 3. Determine the payment flow from the configured approval threshold.
        var requiresApproval = amount > paymentRules.Value.ApprovalThreshold;

        if (requiresApproval)
        {
            await AddInitialApprovalStepAsync(payment);
        }
        else
        {
            CompletePaymentOrThrow(payment, account);
        }

        // 4. Persist the payment, any balance and transaction changes, and the audit entry
        // as ONE unit: a payment must never exist without its CREATE_PAYMENT audit entry,
        // and an audit entry must never describe a payment that was not saved.
        //
        // The payment id comes from the database, so the payment has to be saved before
        // the audit entry can name it. Both saves run inside one database transaction,
        // and the transaction is only committed after the audit entry is saved. If
        // anything fails in between, disposing the transaction rolls the payment back.
        //
        // The tenant's audit lock is held until the commit, so no other audit entry for
        // this tenant can read the same "latest signature" and fork the chain.
        var tenantLock = auditService.GetTenantLock(tenantId);
        await tenantLock.WaitAsync();

        try
        {
            // Another request may have completed while this request waited for
            // the tenant lock. Check again before changing the database.
            existingPayment = await FindExistingIdempotentPaymentAsync(
                tenantId,
                fromAccountId,
                toIban,
                amount,
                currency,
                reference,
                createdById,
                normalizedIdempotencyKey);

            if (existingPayment is not null)
            {
                return existingPayment;
            }

            await using var transaction = await paymentRepository.BeginTransactionAsync();

            await paymentRepository.AddPaymentAsync(payment);

            await auditService.AppendEntryAsync(
                tenantId,
                createdById,
                "CREATE_PAYMENT",
                "payment",
                payment.Id,
                $"Betalning skapad: {amount.ToString("F2", CultureInfo.InvariantCulture)} {currency} " +
                $"till {toIban}. " +
                (requiresApproval ? "Väntar på attest." : "Genomförd direkt."));

            await paymentRepository.SaveChangesAsync();

            if (transaction is not null)
            {
                await transaction.CommitAsync();
            }
        }
        catch (DbUpdateException exception)
            when (IsIdempotencyKeyViolation(exception))
        {
            // A different API instance can win the race because the tenant lock
            // only coordinates requests inside this process. The database index
            // is the final guard; clear the failed insert and return the winner.
            paymentRepository.ClearTrackedChanges();

            existingPayment = await FindExistingIdempotentPaymentAsync(
                tenantId,
                fromAccountId,
                toIban,
                amount,
                currency,
                reference,
                createdById,
                normalizedIdempotencyKey);

            if (existingPayment is not null)
            {
                return existingPayment;
            }

            throw;
        }
        finally
        {
            tenantLock.Release();
        }

        return payment;
    }

    private async Task<Payment?> FindExistingIdempotentPaymentAsync(
        int tenantId,
        int fromAccountId,
        string toIban,
        decimal amount,
        string currency,
        string? reference,
        int? createdById,
        string? idempotencyKey)
    {
        if (idempotencyKey is null || !createdById.HasValue)
        {
            return null;
        }

        var existingPayment =
            await paymentRepository.GetByIdempotencyKeyAsync(
                tenantId,
                createdById.Value,
                idempotencyKey);

        if (existingPayment is null)
        {
            return null;
        }

        var hasSamePaymentData =
            existingPayment.FromAccountId == fromAccountId &&
            existingPayment.ToIban == toIban &&
            existingPayment.Amount == amount &&
            existingPayment.Currency == currency &&
            existingPayment.Reference == reference;

        if (!hasSamePaymentData)
        {
            throw new PaymentIdempotencyConflictException(idempotencyKey);
        }

        return existingPayment;
    }

    private static bool IsIdempotencyKeyViolation(
        DbUpdateException exception)
    {
        return exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: IdempotencyIndexName
        };
    }

    private async Task AddInitialApprovalStepAsync(Payment payment)
    {
        var excludedUserIds = new List<int>();

        if (payment.CreatedById.HasValue)
        {
            excludedUserIds.Add(payment.CreatedById.Value);
        }

        var attestantId = await approvalRepository.FindNextAttestantIdAsync(
            payment.TenantId,
            excludedUserIds);

        payment.ApprovalSteps.Add(new ApprovalStep
        {
            AttestantId = attestantId,
            StepNumber = 1,
            Status = ApprovalStatuses.Pending
        });
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

    /// <summary>
    /// Completes a payment and turns a failed attempt into the matching custom
    /// exception, so the global exception handler can answer with the right status
    /// code. Used both when a small payment skips approval and when the last
    /// attestant approves a large one (US-26).
    /// </summary>
    public void CompletePaymentOrThrow(Payment payment, Account account)
    {
        var result = CompletePayment(payment, account);

        if (result.WasSuccessful)
        {
            return;
        }

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

    /// <summary>
    /// Whether a payment of this amount needs a second attestant. Reads the one
    /// configured threshold so payment creation, the approval flow and the
    /// frontend badge can never disagree again (BUG-006).
    /// </summary>
    public bool RequiresDoubleApproval(decimal amount) =>
        amount > paymentRules.Value.DoubleApprovalThreshold;

    /// <summary>How many approval steps a payment of this amount requires.</summary>
    public int RequiredApprovalSteps(decimal amount) =>
        RequiresDoubleApproval(amount) ? 2 : 1;
}
