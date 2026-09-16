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
}
