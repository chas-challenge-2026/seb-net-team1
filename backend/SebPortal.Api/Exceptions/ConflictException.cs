namespace SebPortal.Api.Exceptions;

/// <summary>
/// The request is valid, but the current state of the resource makes it
/// impossible to complete (e.g. already decided, already completed). Maps to 409.
/// </summary>
public abstract class ConflictException(string userMessage, string? technicalMessage = null)
    : AppException(userMessage, technicalMessage)
{
    public override int StatusCode => StatusCodes.Status409Conflict;
}
