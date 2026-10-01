using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Exceptions;
using System.Net;

namespace SebPortal.Api.Middleware;

/// <summary>
/// Central exception handler. Registered via builder.Services.AddExceptionHandler
/// and app.UseExceptionHandler() in Program.cs. Requires
/// builder.Services.AddProblemDetails() to also be registered.
///
/// Two jobs:
/// 1. If the exception is a known AppException, return its StatusCode and
///    UserMessage as a standard RFC 7807 ProblemDetails body.
/// 2. For anything else (a genuine bug, a null reference, whatever), log
///    the real exception for developers but return a generic 500 with no
///    details. This is what stops v1's "raw exception in UI" bug (see
///    Index.cshtml.cs, NewPayment.cshtml.cs, etc) from happening again.
///
/// This handler always returns true: nothing falls through to the
/// framework's default (blank page / dev exception page) in any environment.
/// </summary>
public class AppExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ILogger<AppExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, detail) = exception switch
        {
            AppException appException => (appException.StatusCode, appException.UserMessage),
            _ => (StatusCodes.Status500InternalServerError, "Ett oväntat fel uppstod. Försök igen senare.")
        };

        if (exception is AppException appEx)
        {
            logger.LogWarning(
                exception,
                "Handled {ExceptionType}: {TechnicalMessage}",
                appEx.GetType().Name,
                appEx.Message);
        }
        else
        {
            logger.LogError(exception, "Unhandled exception on {Path}", httpContext.Request.Path);
        }

        httpContext.Response.StatusCode = statusCode;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            Exception = exception,
            ProblemDetails = new ProblemDetails
            {
                Status = statusCode,
                Title = ((HttpStatusCode)statusCode).ToString(),
                Detail = detail
            }
        });
    }
}
