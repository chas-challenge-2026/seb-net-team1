using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;

namespace SebPortal.Api.Auth;

/// <summary>
/// Service responsible for issuing signed JSON Web Tokens (JWT) for authenticated users.
/// Browsers send JWTs in an HttpOnly cookie. Explicit Bearer headers are also accepted
/// for clients that already hold a token.
/// </summary>
public class JwtTokenService
{
    private readonly JwtConfiguration _configuration;

    /// <summary>
    /// Uses the same startup configuration as JWT validation, including during key rotation.
    /// </summary>
    public JwtTokenService(JwtConfiguration configuration)
    {
        _configuration = configuration;
    }

    /// <summary>
    /// Generates a signed JWT string for an authenticated user containing identity and role claims.
    /// </summary>
    /// <param name="userId">Unique identifier of the user (stored in 'sub' claim).</param>
    /// <param name="tenantId">The tenant/company identifier the authenticated user belongs to.</param>
    /// <param name="email">User's email address (stored in 'email' claim).</param>
    /// <param name="role">User's authorization role, e.g. "initiator", "attestant", "admin" (stored in Role claim).</param>
    /// <param name="name">Full name or display name of the user (stored in Name claim).</param>
    /// <returns>A serialized, signed JWT string.</returns>
    public string GenerateToken(int userId, int tenantId, string email, string role, string name)
    {
        // Sign only with the active key. The previous key is reserved for validation.
        var credentials = new SigningCredentials(_configuration.ActiveKey, SecurityAlgorithms.HmacSha256);

        // Define the claims (payload data).
        // Claims are key-value pairs stored inside the token. They can be read by any party
        // (since JWT is Base64Url-encoded, not encrypted), but cannot be tampered with.
        var claims = new[]
        {
            // 'sub' (Subject): Standard JWT claim representing the unique user identifier
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),

            new Claim("tenantId", tenantId.ToString()),

            // Standard JWT claim representing the user's email address
            new Claim(JwtRegisteredClaimNames.Email, email),

            // Standard claim representing user's display name
            new Claim(ClaimTypes.Name, name),

            // Role claim: Used by ASP.NET Core authorization attributes [Authorize(Roles = "...")]
            new Claim(ClaimTypes.Role, role)
        };

        // Construct the JWT security token object.
        var token = new JwtSecurityToken(
            issuer: _configuration.Issuer,       // 'iss' claim: validates the token came from this API
            audience: _configuration.Audience,   // 'aud' claim: validates the token was meant for this client
            claims: claims,                     // Payload claims
            expires: DateTime.UtcNow.Add(JwtConfiguration.TokenLifetime), // Tokens expire after two hours.
            signingCredentials: credentials);   // Generates the third part of the JWT: the signature

        // Serialize the token object into its compact 3-part string representation:
        // "<Header>.<Payload>.<Signature>"
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
