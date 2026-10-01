namespace SebPortal.Api.Exceptions;

/// <summary>Something the client asked for doesn't exist. Maps to 404.</summary>
public abstract class NotFoundException(string userMessage, string? technicalMessage = null)
    : AppException(userMessage, technicalMessage)
{
    public override int StatusCode => StatusCodes.Status404NotFound;
}
