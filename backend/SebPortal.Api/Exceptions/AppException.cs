namespace SebPortal.Api.Exceptions;

/// <summary>
/// Base class for all custom exceptions the API knows how to handle safely.
/// AppExceptionHandler catches these and returns UserMessage + StatusCode
/// to the client. The real .NET Exception.Message stays in the logs only,
/// never sent to the client (see v1 BUG: raw exception messages in UI).
/// </summary>
public abstract class AppException : Exception
{
    public abstract int StatusCode { get; }

    /// <summary>Safe, user facing message. Shown to the client as is.</summary>
    public string UserMessage { get; }

    protected AppException(string userMessage, string? technicalMessage = null)
        : base(technicalMessage ?? userMessage)
    {
        UserMessage = userMessage;
    }
}
