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
