using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace SebPortal.Api.Auth;

/// <summary>Rate limits for the anonymous auth endpoints (brute force protection).</summary>
public static class RateLimitPolicies
{
    public const string Login = "login";
    public const string Refresh = "refresh";

    public static IServiceCollection AddAuthRateLimiting(this IServiceCollection services, IConfiguration configuration)
    {
        var loginPermits = configuration.GetValue("RateLimiting:LoginPerMinute", 10);

        return services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            options.AddPolicy(Login, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = loginPermits,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));

            options.AddPolicy(Refresh, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 60,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));

            options.OnRejected = async (context, cancellationToken) =>
            {
                var problem = new ProblemDetails
                {
                    Status = StatusCodes.Status429TooManyRequests,
                    Title = "TooManyRequests",
                    Detail = "För många inloggningsförsök. Vänta en stund och försök igen."
                };
                await context.HttpContext.Response.WriteAsJsonAsync(
                    problem, (System.Text.Json.JsonSerializerOptions?)null, "application/problem+json", cancellationToken);
            };
        });
    }
}
