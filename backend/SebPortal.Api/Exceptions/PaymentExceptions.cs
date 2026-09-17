namespace SebPortal.Api.Exceptions;

public class PaymentNotFoundException(int paymentId)
    : NotFoundException(
        userMessage: "Betalningen hittades inte.",
        technicalMessage: $"Payment with id {paymentId} was not found.");

public class PaymentAlreadyCompletedException(int paymentId, string currentStatus)
    : ConflictException(
        userMessage: "Betalningen är inte längre under granskning.",
        technicalMessage: $"Payment {paymentId} has status '{currentStatus}', expected 'pending_approval'.");

public class InvalidPaymentAmountException(decimal amount)
    : BadRequestException(
        userMessage: "Beloppet måste vara större än 0.",
        technicalMessage: $"Rejected payment amount: {amount}.");

public class InvalidIbanException(string iban)
    : BadRequestException(
        userMessage: "Ogiltigt IBAN-format. Kontrollera att du angett rätt format.",
        technicalMessage: $"IBAN '{iban}' failed MOD97 checksum validation.");

public class InsufficientFundsException(decimal amount, decimal availableBalance)
    : BadRequestException(
        userMessage: "Kontot har inte tillräckligt saldo för denna betalning.",
        technicalMessage: $"Payment amount {amount} exceeds available balance {availableBalance}.");

/// <summary>
/// Defensive check for CompletePayment's general contract. Not reachable via
/// the current CreatePaymentAsync flow (the payment is always constructed
/// with the same account it's paired with), but relevant once CompletePayment
/// is reused elsewhere, e.g. completing an existing payment during approval.
/// </summary>
public class PaymentAccountMismatchException(int paymentFromAccountId, int providedAccountId)
    : BadRequestException(
        userMessage: "Betalningen tillhör inte det angivna kontot.",
        technicalMessage: $"Payment.FromAccountId {paymentFromAccountId} does not match provided Account.Id {providedAccountId}.");