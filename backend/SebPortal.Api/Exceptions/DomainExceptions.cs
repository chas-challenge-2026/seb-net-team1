using SebPortal.Api.DTOs;

namespace SebPortal.Api.Exceptions;

// Auth

public class InvalidCredentialsException()
    : UnauthorizedException(
        userMessage: "Fel e-post eller lösenord.",
        technicalMessage: "Login failed: unknown e-mail, wrong password or inactive user.");

public class InvalidRefreshTokenException(string reason)
    : UnauthorizedException(
        userMessage: "Din session har gått ut. Logga in igen.",
        technicalMessage: $"Refresh rejected: {reason}.");

public class WrongCurrentPasswordException()
    : BadRequestException(
        userMessage: "Nuvarande lösenord stämmer inte.",
        technicalMessage: "Change password failed: current password did not match.");

public class WeakPasswordException(int minimumLength)
    : BadRequestException(
        userMessage: $"Lösenordet måste vara minst {minimumLength} tecken.",
        technicalMessage: $"Password shorter than {minimumLength} characters.");

// Users

public class UserNotFoundException(int userId)
    : NotFoundException(
        userMessage: "Användaren hittades inte.",
        technicalMessage: $"User {userId} was not found in the caller's tenant.");

public class EmailAlreadyInUseException(string email)
    : ConflictException(
        userMessage: "Det finns redan en användare med den e-postadressen.",
        technicalMessage: $"E-mail '{email}' is already registered.");

public class InvalidUserDataException(string userMessage)
    : BadRequestException(userMessage);

public class CannotChangeOwnAccessException()
    : BadRequestException(
        userMessage: "Du kan inte ta bort din egen administratörsbehörighet eller inaktivera ditt eget konto.",
        technicalMessage: "Admin attempted to demote or deactivate themselves.");

// Payments

public class MissingSourceAccountException()
    : BadRequestException(userMessage: "Välj vilket konto betalningen ska göras från.");

public class InvalidPaymentReferenceException(int maxLength)
    : BadRequestException(
        userMessage: $"Referensen får vara högst {maxLength} tecken.",
        technicalMessage: $"Payment reference exceeds {maxLength} characters.");

public class InvalidPaymentAmountPrecisionException(decimal amount)
    : BadRequestException(
        userMessage: "Beloppet får ha högst två decimaler.",
        technicalMessage: $"Rejected payment amount with more than two decimals: {amount}.");

public class PaymentAmountTooLargeException(decimal amount, decimal maxAmount)
    : BadRequestException(
        userMessage: $"Beloppet får vara högst {Services.Money.Display(maxAmount)} kr.",
        technicalMessage: $"Payment amount {amount} exceeds the maximum {maxAmount}.");

public class SameAccountPaymentException(string iban)
    : BadRequestException(
        userMessage: "Mottagarkontot kan inte vara samma som avsändarkontot.",
        technicalMessage: $"Payment to its own source account {iban}.");

public class IdempotencyKeyTooLongException(int maxLength)
    : BadRequestException(
        userMessage: "Ogiltig Idempotency-Key.",
        technicalMessage: $"Idempotency-Key longer than {maxLength} characters.");

/// <summary>Someone else changed the same account, payment or approval step at the same moment.</summary>
public class ConcurrencyConflictException(string? technicalMessage = null)
    : ConflictException(
        userMessage: "Någon annan ändrade samma betalning eller konto samtidigt. Ladda om och försök igen.",
        technicalMessage: technicalMessage ?? "Optimistic concurrency conflict.");

/// <summary>Four-eyes principle: nobody attests a payment they created themselves.</summary>
public class OwnPaymentApprovalException(int paymentId, int userId)
    : ForbiddenException(
        userMessage: "Du kan inte attestera en betalning som du själv har skapat.",
        technicalMessage: $"User {userId} attempted to decide an approval step on their own payment {paymentId}.");

// Batch

public class BatchValidationException(BatchValidationResponse validation)
    : BadRequestException(
        userMessage: "Batchfilen innehåller fel. Inga betalningar har skapats.",
        technicalMessage: $"Batch file '{validation.FileName}' rejected: {validation.FileErrors.Count} file errors, {validation.InvalidRowCount} invalid rows.")
{
    public override IReadOnlyDictionary<string, object?>? Extensions =>
        new Dictionary<string, object?> { ["validation"] = validation };
}

public class BatchFileMissingException()
    : BadRequestException(userMessage: "Välj en CSV-fil att ladda upp.");
