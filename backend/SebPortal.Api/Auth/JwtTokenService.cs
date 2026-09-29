using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;

namespace SebPortal.Api.Auth;

/// <summary>
/// Service responsible for issuing signed JSON Web Tokens (JWT) for authenticated users.
/// JWTs are stateless tokens passed in the Authorization header (Bearer scheme) by clients
/// to verify their identity and permissions on subsequent API requests.
/// </summary>
public class JwtTokenService
{
    private readonly JwtSettings _settings;

    public JwtTokenService(JwtSettings settings)
    {
        _settings = settings;
    }

    /// <summary>
    /// Reads the JWT settings (key, issuer, audience, lifetime) from configuration,
    /// typically appsettings.json or environment variables.
    /// </summary>
    public JwtTokenService(IConfiguration configuration)
        : this(JwtSettings.FromConfiguration(configuration))
    {
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
    public string GenerateToken(int userId, int tenantId, string email, string role, string name) =>
        CreateAccessToken(userId, tenantId, email, role, name).Token;

    /// <summary>Like <see cref="GenerateToken"/>, but also returns when the token expires.</summary>
    public (string Token, DateTime ExpiresAt) CreateAccessToken(int userId, int tenantId, string email, string role, string name)
    {
        // SigningCredentials combines the key and the hashing algorithm (HmacSha256)
        // to produce the cryptographic signature that prevents tampering.
        var credentials = new SigningCredentials(_settings.SecurityKey, SecurityAlgorithms.HmacSha256);

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
            new Claim(ClaimTypes.Role, role),

            // Unique token id, so two tokens issued in the same second still differ
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
        };

        var expiresAt = DateTime.UtcNow.Add(_settings.AccessTokenLifetime);

        var token = new JwtSecurityToken(
            issuer: _settings.Issuer,             // 'iss' claim: validates the token came from this API
            audience: _settings.Audience,         // 'aud' claim: validates the token was meant for this client
            claims: claims,
            expires: expiresAt,                   // 'exp' claim: short lived, renewed with the refresh token
            signingCredentials: credentials);

        // Serialize the token object into its compact 3-part string representation:
        // "<Header>.<Payload>.<Signature>"
        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }
}
