using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace SebPortal.Api.Auth;

/// <summary>One startup snapshot shared by JWT signing and validation.</summary>
public sealed class JwtConfiguration
{
    public static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(2);

    private readonly SecurityKey[] _validationKeys;

    public SymmetricSecurityKey ActiveKey { get; }
    public string Issuer { get; }
    public string Audience { get; }

    private JwtConfiguration(SymmetricSecurityKey activeKey, SymmetricSecurityKey? previousKey,
        string issuer, string audience)
    {
        ActiveKey = activeKey;
        Issuer = issuer;
        Audience = audience;
        _validationKeys = previousKey is null ? [activeKey] : [activeKey, previousKey];
    }

    public static JwtConfiguration FromConfiguration(IConfiguration configuration)
    {
        var active = CreateKey(configuration["Jwt:Key"], "Jwt:Key");
        var previousValue = configuration["Jwt:PreviousKey"];
        var previous = string.IsNullOrEmpty(previousValue)
            ? null
            : CreateKey(previousValue, "Jwt:PreviousKey");
        if (previous?.KeyId == active.KeyId)
        {
            throw new InvalidOperationException("Jwt:PreviousKey must differ from Jwt:Key.");
        }

        return new JwtConfiguration(active, previous,
            configuration["Jwt:Issuer"] ?? "SebPortal.Api",
            configuration["Jwt:Audience"] ?? "SebPortal.Client");
    }

    public TokenValidationParameters CreateValidationParameters() => new()
    {
        ValidateIssuerSigningKey = true,
        // Legacy tokens have no kid. Only in that case, try both configured keys.
        IssuerSigningKeyResolver = (_, _, keyId, _) => string.IsNullOrEmpty(keyId)
            ? _validationKeys
            : _validationKeys.Where(key => key.KeyId == keyId),
        TryAllIssuerSigningKeys = false,
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        RequireSignedTokens = true,
        ValidateIssuer = true,
        ValidIssuer = Issuer,
        ValidateAudience = true,
        ValidAudience = Audience,
        RequireExpirationTime = true,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };

    private static SymmetricSecurityKey CreateKey(string? value, string settingName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"{settingName} is missing. Configure the JWT signing keys before starting the API.");
        }

        // Preserve the existing UTF-8 convention, including keys generated as Base64 strings.
        var bytes = Encoding.UTF8.GetBytes(value);
        if (bytes.Length < 32)
        {
            throw new InvalidOperationException($"{settingName} must contain at least 32 UTF-8 bytes.");
        }

        return new SymmetricSecurityKey(bytes)
        {
            // The public identifier stays the same when a key moves into the previous slot.
            KeyId = Base64UrlEncoder.Encode(SHA256.HashData(bytes))
        };
    }
}
