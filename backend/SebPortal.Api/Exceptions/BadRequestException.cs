namespace SebPortal.Api.Exceptions;

/// <summary>
/// The request itself is malformed or fails a business validation rule
/// (bad IBAN, non positive amount, etc). Maps to 400.
/// </summary>
public abstract class BadRequestException(string userMessage, string? technicalMessage = null)
    : AppException(userMessage, technicalMessage)
{
    public override int StatusCode => StatusCodes.Status400BadRequest;
}
