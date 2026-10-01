using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace SebPortal.Api.Auth;

public static class ClaimsPrincipalExtensions
{
    public static int? GetUserId(this ClaimsPrincipal user)
    {
        var claimValue = user.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

        return int.TryParse(claimValue, out var userId)
            ? userId
            : null;
    }

    public static int? GetTenantId(this ClaimsPrincipal user)
    {
        var claimValue = user.FindFirst("tenantId")?.Value;

        return int.TryParse(claimValue, out var tenantId)
            ? tenantId
            : null;
    }

    /// <summary>
    /// The role claim issued by JwtTokenService ("initiator", "attestant", "admin").
    /// Used for the rules that depend on the role rather than just on being
    /// authenticated, e.g. whether an admin may decide another attestant's step.
    /// </summary>
    public static string? GetRole(this ClaimsPrincipal user) =>
        user.FindFirst(ClaimTypes.Role)?.Value;
}
