namespace SebPortal.Api.Exceptions;

/// <summary>
/// The logged in user is authenticated, but not allowed to access this
/// specific resource (wrong tenant, step not assigned to them, etc). Maps to 403.
/// </summary>
public abstract class ForbiddenException(string userMessage, string? technicalMessage = null)
    : AppException(userMessage, technicalMessage)
{
    public override int StatusCode => StatusCodes.Status403Forbidden;
}
