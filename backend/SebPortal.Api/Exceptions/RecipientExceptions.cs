namespace SebPortal.Api.Exceptions;

public class RecipientValidationException(string message) : BadRequestException(message);

public class DuplicateRecipientException()
    : ConflictException("En mottagare med detta IBAN finns redan. Den befintliga mottagaren har inte ändrats.");

public class RecipientDemoConfirmationDisabledException()
    : ForbiddenException("Simulerad bekräftelse av mottagare är inte aktiverad i den här miljön.");
