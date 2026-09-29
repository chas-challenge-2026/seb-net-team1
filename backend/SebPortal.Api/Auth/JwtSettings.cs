using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace SebPortal.Api.Auth;

/// <summary>
/// JWT configuration (section "Jwt"), shared by token creation and validation so the
/// two can never disagree.
///
/// There is no signing key in source code anymore. Deployed environments set
/// Jwt__Key; when it is missing a random key is generated per process. Access tokens
/// then stop working after a restart, which is harmless: the frontend silently gets a
/// new one with its refresh token, which is stored in the database, not signed.
/// </summary>
public sealed class JwtSettings
{
    private const int MinimumKeyBytes = 32;

    private static readonly Lazy<byte[]> ProcessKey = new(() => RandomNumberGenerator.GetBytes(64));

    public required byte[] SigningKey { get; init; }
    public string Issuer { get; init; } = "SebPortal.Api";
    public string Audience { get; init; } = "SebPortal.Client";
    public TimeSpan AccessTokenLifetime { get; init; } = TimeSpan.FromMinutes(15);
    public TimeSpan RefreshTokenLifetime { get; init; } = TimeSpan.FromDays(7);
    public bool UsesGeneratedKey { get; init; }

    public SymmetricSecurityKey SecurityKey => new(SigningKey);

    public static JwtSettings FromConfiguration(IConfiguration configuration)
    {
        var configuredKey = configuration["Jwt:Key"];
        var keyBytes = string.IsNullOrWhiteSpace(configuredKey) ? null : Encoding.UTF8.GetBytes(configuredKey);

        if (keyBytes is not null && keyBytes.Length < MinimumKeyBytes)
        {
            throw new InvalidOperationException($"Jwt:Key must be at least {MinimumKeyBytes} bytes long.");
        }

        return new JwtSettings
        {
            SigningKey = keyBytes ?? ProcessKey.Value,
            UsesGeneratedKey = keyBytes is null,
            Issuer = configuration["Jwt:Issuer"] ?? "SebPortal.Api",
            Audience = configuration["Jwt:Audience"] ?? "SebPortal.Client",
            AccessTokenLifetime = TimeSpan.FromMinutes(configuration.GetValue("Jwt:AccessTokenMinutes", 15)),
            RefreshTokenLifetime = TimeSpan.FromDays(configuration.GetValue("Jwt:RefreshTokenDays", 7))
        };
    }

    public TokenValidationParameters ValidationParameters() => new()
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = SecurityKey,
        ValidateIssuer = true,
        ValidIssuer = Issuer,
        ValidateAudience = true,
        ValidAudience = Audience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };
}
