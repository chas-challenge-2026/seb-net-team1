using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace SebPortal.Api.Auth;

// Login and logout require CSRF validation even before a user has an auth cookie.
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireCsrfAttribute : Attribute;

public sealed class CookieAntiforgeryFilter(IAntiforgery antiforgery) : IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var request = context.HttpContext.Request;
        if (HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method) ||
            HttpMethods.IsOptions(request.Method) || HttpMethods.IsTrace(request.Method))
        {
            return;
        }

        // Explicit bearer credentials are not sent automatically by the browser.
        // A cookie must never bypass CSRF merely because an Authorization header was added.
        var requiresCsrf = context.ActionDescriptor.EndpointMetadata.OfType<RequireCsrfAttribute>().Any();
        var bearerOnly = !request.Cookies.ContainsKey(AuthCookie.Name) &&
            request.Headers.Authorization.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) &&
            context.HttpContext.User.Identity?.IsAuthenticated == true;
        if (!requiresCsrf && bearerOnly)
        {
            return;
        }

        try
        {
            await antiforgery.ValidateRequestAsync(context.HttpContext);
        }
        catch (AntiforgeryValidationException)
        {
            context.Result = new BadRequestObjectResult(new { message = "Invalid CSRF token." });
        }
    }
}
