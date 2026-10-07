namespace SebPortal.Api.Auth;

public static class AuthCookie
{
    public const string Name = "SebPortal.Auth";

    public static CookieSecurePolicy SecurePolicy(IConfiguration configuration) =>
        configuration.GetValue<bool>("Auth:AllowInsecureCookies")
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;

    public static CookieOptions CreateOptions(HttpRequest request, IConfiguration configuration) => new()
    {
        HttpOnly = true,
        Secure = SecurePolicy(configuration) == CookieSecurePolicy.Always || request.IsHttps,
        SameSite = SameSiteMode.Strict,
        Path = "/api",
        IsEssential = true
    };
}
