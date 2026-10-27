using System.Globalization;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
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

    public async Task RecordIbanFormatFailureAsync(int tenantId, int? userId) =>
        await auditService.LogImmediatelyAsync(
            tenantId,
            userId,
            "VALIDATE_IBAN",
            "payment_validation",
            null,
            "IBAN-valideringen stoppade ett betalningsförsök eftersom formatet var ogiltigt.");

    public static string NormalizeIban(string iban) =>
        new string(iban.Where(character => !char.IsWhiteSpace(character)).ToArray()).ToUpperInvariant();

    /// <summary>
    /// Checks a normalized (no spaces, upper case) IBAN: length and characters, then
    /// the MOD97 checksum (ISO 13616). A wrong check digit is rejected here instead of
    /// being saved and paid out.
    /// </summary>
    public static bool HasValidIbanFormat(string iban)
    {
        if (iban.Length is < 15 or > 34 ||
            !char.IsAsciiLetter(iban[0]) || !char.IsAsciiLetter(iban[1]) ||
            !char.IsAsciiDigit(iban[2]) || !char.IsAsciiDigit(iban[3]) ||
            !iban.All(character => char.IsAsciiLetterOrDigit(character)))
        {
            return false;
        }

        return HasValidIbanChecksum(iban);
    }

    private static bool HasValidIbanChecksum(string iban)
    {
        var rearranged = string.Concat(iban.AsSpan(4), iban.AsSpan(0, 4));
        var remainder = 0;

        foreach (var character in rearranged)
        {
            var value = char.IsAsciiDigit(character)
                ? character - '0'
                : char.ToUpperInvariant(character) - 'A' + 10;

            remainder = value < 10
                ? (remainder * 10 + value) % 97
                : (remainder * 100 + value) % 97;
        }

        return remainder == 1;
    }

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

/// <summary>The created payment, and whether it was an idempotent replay of an earlier request.</summary>
public sealed record PaymentCreationResult(Payment Payment, bool Replayed);

public class PaymentService(
    PaymentRepository paymentRepository,
    IOptions<PaymentRulesOptions> paymentRules,
    IIbanValidator ibanValidator,
    ApprovalAssignmentService approvalAssignment,
    UnitOfWork unitOfWork)
{
    public const int MaxReferenceLength = 100;
    public const int MaxIdempotencyKeyLength = 64;
    public const decimal MaxAmount = 999_999_999.99m;

    /// <summary>Attempts before a concurrency conflict on the account is reported as 409.</summary>
    private const int MaxConcurrencyAttempts = 3;

    /// <summary>
    /// Creates a payment. Validates the input, the source account (must belong to the
    /// caller's tenant) and the available balance, then either completes the payment
    /// directly (at or below the approval threshold) or creates the first approval
    /// step and notifies the attestant. The payment, its balance change, approval
    /// step, audit entry and notification are committed together.
    /// </summary>
    public async Task<PaymentCreationResult> CreatePaymentAsync(CreatePaymentCommand command)
    {
        var idempotencyKey = NormalizeIdempotencyKey(command.IdempotencyKey);

        if (idempotencyKey is not null)
        {
            var existing = await paymentRepository.FindByIdempotencyKeyAsync(command.TenantId, command.UserId, idempotencyKey);
            if (existing is not null)
            {
                return new PaymentCreationResult(existing, Replayed: true);
            }
        }

        if (command.FromAccountId <= 0)
        {
            throw new MissingSourceAccountException();
        }

        var toIban = ValidatePaymentInput(command.ToIban, command.Amount, command.Reference, out var reference);

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                var payment = await CreateOnceAsync(command, toIban, reference, idempotencyKey);
                return new PaymentCreationResult(payment, Replayed: false);
            }
            catch (DbUpdateConcurrencyException) when (attempt < MaxConcurrencyAttempts)
            {
                // Another payment changed the same account between our read and our
                // write (xmin mismatch). Start over with fresh data: the balance check
                // runs again, so the account can never be overdrawn.
                paymentRepository.ResetTracking();
            }
            catch (DbUpdateException ex) when (ex is not DbUpdateConcurrencyException && idempotencyKey is not null)
            {
                // Two requests with the same key raced; the unique index let only one win.
                paymentRepository.ResetTracking();
                var winner = await paymentRepository.FindByIdempotencyKeyAsync(command.TenantId, command.UserId, idempotencyKey);
                if (winner is not null)
                {
                    return new PaymentCreationResult(winner, Replayed: true);
                }
                throw;
            }
        }
    }

    private Task<Payment> CreateOnceAsync(CreatePaymentCommand command, string toIban, string? reference, string? idempotencyKey) =>
        unitOfWork.RunAsync(command.TenantId, async () =>
        {
            // Read and check the balance inside the transaction, after the tenant lock,
            // so the check sees every payment committed before it.
            //
            // AccountNotFoundException on purpose here, not an access-denied exception:
            // GetAccountAsync filters by (id AND tenantId) in one query, so we genuinely
            // can't tell "doesn't exist" apart from "belongs to another tenant". Returning
            // the same NotFound response for both avoids leaking that distinction across tenants.
            var account = await paymentRepository.GetAccountAsync(command.FromAccountId, command.TenantId)
                ?? throw new AccountNotFoundException(command.FromAccountId);

            if (string.Equals(account.Iban, toIban, StringComparison.Ordinal))
            {
                throw new SameAccountPaymentException(toIban);
            }

            var reserved = await paymentRepository.GetReservedAmountAsync(account.Id);
            EnsureAvailableBalance(account, reserved, command.Amount);

            var payment = NewPayment(command.TenantId, command.UserId, account.Id, toIban, command.Amount,
                reference, idempotencyKey, command.Source);

            ApprovalStep? firstStep = null;
            if (RequiresApproval(command.Amount))
            {
                firstStep = await approvalAssignment.CreateNextStepAsync(payment, []);
            }
            else
            {
                CompletePaymentOrThrow(payment, account);
            }

            // The payment, the balance change (guarded by the account's xmin) and the
            // first approval step are written in one statement batch.
            paymentRepository.AddPayment(payment);
            await paymentRepository.SaveChangesAsync();

            paymentRepository.AddAuditEntry(CreatedAuditEntry(payment));

            if (firstStep is not null)
            {
                await approvalAssignment.NotifyAsync(payment, firstStep, [firstStep], RequiredApprovalSteps(payment.Amount));
            }

            await paymentRepository.SaveChangesAsync();
            return payment;
        });

    /// <summary>
    /// Validates the parts of a payment that do not need the database and returns the
    /// normalized IBAN. Shared with batch uploads so both paths apply the same rules.
    /// </summary>
    public string ValidatePaymentInput(string? toIban, decimal amount, string? reference, out string? normalizedReference)
    {
        if (amount <= 0)
        {
            throw new InvalidPaymentAmountException(amount);
        }

        if (decimal.Round(amount, 2) != amount)
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
        var requiresApproval = RequiresApproval(amount);

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
                PaymentCreatedDescription(amount, currency, toIban, requiresApproval));

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

        normalizedReference = NormalizeReference(reference);

        var iban = ibanValidator.Validate(toIban);
        if (!iban.IsValid)
        {
            throw new InvalidIbanException(iban.Normalized, iban.Message);
        }

        return iban.Normalized;
    }

    public static string? NormalizeReference(string? reference)
    {
        var trimmed = reference?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }

        if (trimmed.Length > MaxReferenceLength)
        {
            throw new InvalidPaymentReferenceException(MaxReferenceLength);
        }

        return trimmed;
    }

    public static void EnsureAvailableBalance(Account account, decimal reserved, decimal amount)
    {
        var available = account.Balance - reserved;
        if (amount > available)
        {
            throw new InsufficientFundsException(amount, available);
        }
    }

    internal static Payment NewPayment(int tenantId, int userId, int accountId, string toIban, decimal amount,
        string? reference, string? idempotencyKey, string source) => new()
    {
        TenantId = tenantId,
        FromAccountId = accountId,
        ToIban = toIban,
        Amount = amount,
        Currency = "SEK",
        Reference = reference,
        CreatedById = userId,
        CreatedAt = DateTime.UtcNow,
        Status = PaymentStatuses.PendingApproval,
        Source = source,
        IdempotencyKey = idempotencyKey
    };

    internal static AuditEntry CreatedAuditEntry(Payment payment)
    {
        var outcome = payment.Status == PaymentStatuses.Completed
            ? "genomförd direkt"
            : "skickad för attest";
        var via = payment.Source == PaymentSources.Batch ? " via batchfil" : string.Empty;

        return Audit.Entry(
            payment.TenantId,
            payment.CreatedById,
            AuditActions.CreatePayment,
            AuditEntityTypes.Payment,
            payment.Id,
            $"Betalning #{payment.Id} på {Money.Display(payment.Amount)} {payment.Currency} till {payment.ToIban} " +
            $"skapad{via} och {outcome}." +
            (payment.Reference is null ? string.Empty : $" Referens: {payment.Reference}."));
    }

    private static string? NormalizeIdempotencyKey(string? key)
    {
        var trimmed = key?.Trim();
        if (string.IsNullOrEmpty(trimmed))
        {
            return null;
        }

        if (trimmed.Length > MaxIdempotencyKeyLength)
        {
            throw new IdempotencyKeyTooLongException(MaxIdempotencyKeyLength);
        }

        return trimmed;
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

    private async Task AddInitialApprovalStepsAsync(Payment payment)
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

        // The balance change is saved with the payment in one SaveChanges, guarded by
        // the account's xmin concurrency token: two payments that read the same balance
        // cannot both be written (US-24, fixes BUG-009).
        account.Balance -= payment.Amount;
        payment.Status = PaymentStatuses.Completed;
        payment.ExecutedAt = DateTime.UtcNow;

        account.Transactions.Add(new Transaction
        {
            AccountId = account.Id,
            Payment = payment,
            Amount = -payment.Amount,
            Date = payment.ExecutedAt.Value,
            Description = payment.Reference ?? $"Betalning till {payment.ToIban}",
            TransactionType = TransactionTypes.Payment
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

    /// <summary>Payments above the configured threshold need attest instead of completing directly.</summary>
    public bool RequiresApproval(decimal amount) =>
        amount > paymentRules.Value.ApprovalThreshold;

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