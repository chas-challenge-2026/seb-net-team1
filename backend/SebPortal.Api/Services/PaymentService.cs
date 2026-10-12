using System.Globalization;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using Microsoft.Extensions.Options;
using SebPortal.Api.Options;

namespace SebPortal.Api.Services;

public class PaymentService(
    PaymentRepository paymentRepository,
    ApprovalRepository approvalRepository,
    IOptions<PaymentRulesOptions> paymentRules,
    AuditService auditService)
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
<<<<<<< HEAD
        var requiresApproval = RequiresApproval(amount);
=======
        var requiresApproval = amount > paymentRules.Value.ApprovalThreshold ||
            RequiresDoubleApproval(amount);
>>>>>>> origin/develop

        if (requiresApproval)
        {
            await AddInitialApprovalStepsAsync(payment);
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
            await using var transaction = await paymentRepository.BeginTransactionAsync();

            await paymentRepository.AddPaymentAsync(payment);

            await auditService.AppendEntryAsync(
                tenantId,
                createdById,
                "CREATE_PAYMENT",
                "payment",
                payment.Id,
                PaymentCreatedDescription(amount, currency, toIban, requiresApproval));

            await paymentRepository.SaveChangesAsync();

            if (transaction is not null)
            {
                await transaction.CommitAsync();
            }
        }
        finally
        {
            tenantLock.Release();
        }

        return payment;
    }

<<<<<<< HEAD
    /// <summary>
    /// Creates several payments as one unit for a validated batch file: either every
    /// payment (with its balance changes, approval step and CREATE_PAYMENT audit entry)
    /// is saved, or none is. The caller is expected to have validated the rows already;
    /// a failure here (an account that changed since, insufficient funds) throws and
    /// rolls everything back.
    /// </summary>
    /// <param name="payments">
    /// Unsaved payments with FromAccountId, ToIban, Amount, Currency and Reference set.
    /// Tenant, creator, timestamp and status are filled in here.
    /// </param>
    public async Task<IReadOnlyList<Payment>> CreatePaymentsAsync(
        int tenantId,
        int? createdById,
        IReadOnlyList<Payment> payments)
    {
        // 1. Prepare every payment against one tracked copy of each account, so the
        // balance of an account keeps going down across the rows paying from it.
        var accounts = new Dictionary<int, Account>();
        var approvalFlags = new List<bool>(payments.Count);

        foreach (var payment in payments)
        {
            if (!accounts.TryGetValue(payment.FromAccountId, out var account))
            {
                // Same not-found for "missing" and "other tenant", as in CreatePaymentAsync.
                account = await paymentRepository.GetAccountAsync(payment.FromAccountId, tenantId)
                    ?? throw new AccountNotFoundException(payment.FromAccountId);
                accounts[payment.FromAccountId] = account;
            }

            payment.TenantId = tenantId;
            payment.CreatedById = createdById;
            payment.CreatedAt = DateTime.UtcNow;
            payment.Status = PaymentStatuses.PendingApproval;

            var requiresApproval = RequiresApproval(payment.Amount);

            if (requiresApproval)
            {
                await AddInitialApprovalStepAsync(payment);
            }
            else
            {
                CompletePaymentOrThrow(payment, account);
            }

            approvalFlags.Add(requiresApproval);
        }

        // 2. Persist. The tenant's audit lock is held until the commit, for the same
        // reason as in CreatePaymentAsync, and every audit entry needs the previous
        // one saved so the signature chain links instead of forking.
        var tenantLock = auditService.GetTenantLock(tenantId);
        await tenantLock.WaitAsync();

        try
        {
            await using var transaction = await paymentRepository.BeginTransactionAsync();

            // One save for all payments, balances and transactions. This also gives
            // every payment its database id for the audit entries below.
            paymentRepository.AddPayments(payments);
            await paymentRepository.SaveChangesAsync();

            for (var i = 0; i < payments.Count; i++)
            {
                var payment = payments[i];

                await auditService.AppendEntryAsync(
                    tenantId,
                    createdById,
                    "CREATE_PAYMENT",
                    "payment",
                    payment.Id,
                    PaymentCreatedDescription(payment.Amount, payment.Currency, payment.ToIban, approvalFlags[i]));

                await paymentRepository.SaveChangesAsync();
            }

            if (transaction is not null)
            {
                await transaction.CommitAsync();
            }
        }
        finally
        {
            tenantLock.Release();
        }

        return payments;
    }

    /// <summary>
    /// Whether a payment of this amount must be approved by an attestant instead of
    /// being completed directly. Reads the one configured threshold.
    /// </summary>
    public bool RequiresApproval(decimal amount) =>
        amount > paymentRules.Value.ApprovalThreshold;

    private static string PaymentCreatedDescription(
        decimal amount, string currency, string toIban, bool requiresApproval) =>
        $"Betalning skapad: {amount.ToString("F2", CultureInfo.InvariantCulture)} {currency} " +
        $"till {toIban}. " +
        (requiresApproval ? "Väntar på attest." : "Genomförd direkt.");

    private async Task AddInitialApprovalStepAsync(Payment payment)
=======
    private async Task AddInitialApprovalStepsAsync(Payment payment)
>>>>>>> origin/develop
    {
        var excludedUserIds = new List<int>();

        if (payment.CreatedById.HasValue)
        {
            excludedUserIds.Add(payment.CreatedById.Value);
        }

        for (var stepNumber = 1; stepNumber <= RequiredApprovalSteps(payment.Amount); stepNumber++)
        {
            var attestantId = await approvalRepository.FindNextAttestantIdAsync(
                payment.TenantId,
                excludedUserIds);

            payment.ApprovalSteps.Add(new ApprovalStep
            {
                AttestantId = attestantId,
                StepNumber = stepNumber,
                Status = ApprovalStatuses.Pending
            });

            if (attestantId.HasValue)
            {
                excludedUserIds.Add(attestantId.Value);
            }
        }
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
