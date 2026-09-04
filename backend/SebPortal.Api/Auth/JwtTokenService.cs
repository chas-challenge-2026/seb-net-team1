using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace SebPortal.Api.Auth;

/// <summary>
/// Service responsible for issuing signed JSON Web Tokens (JWT) for authenticated users.
/// JWTs are stateless tokens passed in the Authorization header (Bearer scheme) by clients
/// to verify their identity and permissions on subsequent API requests.
/// </summary>
public class JwtTokenService
{
    private readonly IConfiguration _configuration;

    /// <summary>
    /// Injects application configuration to access JWT configuration values
    /// (such as secret key, issuer, and audience) typically set in appsettings.json or environment variables.
    /// </summary>
    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    /// <summary>
    /// Generates a signed JWT string for an authenticated user containing identity and role claims.
    /// </summary>
    /// <param name="userId">Unique identifier of the user (stored in 'sub' claim).</param>
    /// <param name="email">User's email address (stored in 'email' claim).</param>
    /// <param name="role">User's authorization role, e.g. "initiator", "attestant", "admin" (stored in Role claim).</param>
    /// <param name="name">Full name or display name of the user (stored in Name claim).</param>
    /// <returns>A serialized, signed JWT string.</returns>
    public string GenerateToken(int userId, string email, string role, string name)
    {
        // 1. Retrieve JWT configuration settings
        // - Key: Secret key used to cryptographically sign the token. Minimum 256 bits (32 bytes) for HMAC-SHA256.
        // - Issuer: Who created and signed the token (our API).
        // - Audience: Who the token is intended for (our client/frontend).
        var keyString = _configuration["Jwt:Key"] ?? "ThisIsADevelopmentSecretKeyWithAtLeast32BytesLength!";
        var issuer = _configuration["Jwt:Issuer"] ?? "SebPortal.Api";
        var audience = _configuration["Jwt:Audience"] ?? "SebPortal.Client";

        // 2. Prepare the cryptographic key and signing credentials
        // We convert the secret string into a UTF-8 byte array to construct a SymmetricSecurityKey.
        // Both signing and verification use this same secret key.
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyString));

        // SigningCredentials combines the key and the hashing algorithm (HmacSha256)
        // to produce the cryptographic signature that prevents tampering.
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // 3. Define the Claims (payload data)
        // Claims are key-value pairs stored inside the token. They can be read by any party
        // (since JWT is Base64Url-encoded, not encrypted), but cannot be tampered with.
        var claims = new[]
        {
            // 'sub' (Subject): Standard JWT claim representing the unique user identifier
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),

            // Standard JWT claim representing the user's email address
            new Claim(JwtRegisteredClaimNames.Email, email),

            // Standard claim representing user's display name
            new Claim(ClaimTypes.Name, name),

            // Role claim: Used by ASP.NET Core authorization attributes [Authorize(Roles = "...")]
            new Claim(ClaimTypes.Role, role)
        };

        // 4. Construct the JWT security token object
        var token = new JwtSecurityToken(
            issuer: issuer,                     // 'iss' claim: validates the token came from this API
            audience: audience,                 // 'aud' claim: validates the token was meant for this client
            claims: claims,                     // Payload claims
            expires: DateTime.UtcNow.AddHours(2), // 'exp' claim: token validity duration (expires after 2 hours)
            signingCredentials: credentials);   // Generates the third part of the JWT: the signature

        // 5. Serialize the token object into its compact 3-part string representation:
        // "<Header>.<Payload>.<Signature>"
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
