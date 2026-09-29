using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using SebPortal.Api.Models;

namespace SebPortal.Api.Auditing;

/// <summary>
/// Computes and checks the HMAC-SHA256 chain over audit entries (the tamper
/// evidence from native/README.md module 3, kept in the database so there is a
/// single audit destination instead of v1's database + file split, BUG-008).
/// </summary>
public sealed class AuditHasher
{
    public static readonly string GenesisHash = new('0', 64);

    private readonly byte[] _key;

    public AuditHasher(byte[] key)
    {
        if (key.Length < 32)
        {
            throw new ArgumentException("The audit signing key must be at least 32 bytes.", nameof(key));
        }
        _key = key;
    }

    public static AuditHasher FromSecret(string secret) => new(Encoding.UTF8.GetBytes(secret));

    public string ComputeHash(AuditEntry entry)
    {
        using var hmac = new HMACSHA256(_key);
        var digest = hmac.ComputeHash(Encoding.UTF8.GetBytes(CanonicalForm(entry)));
        return Convert.ToHexString(digest).ToLowerInvariant();
    }

    public bool IsValid(AuditEntry entry) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(ComputeHash(entry)),
            Encoding.ASCII.GetBytes(entry.Hash ?? string.Empty));

    /// <summary>
    /// PostgreSQL stores timestamps with microsecond precision, .NET ticks are 100 ns.
    /// Entries are truncated to microseconds and forced to UTC before hashing, so the
    /// value read back from the database hashes to exactly the same result.
    /// </summary>
    public static DateTime NormalizeTimestamp(DateTime value)
    {
        var utc = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
        return new DateTime(utc.Ticks - utc.Ticks % 10, DateTimeKind.Utc);
    }

    /// <summary>
    /// Every field that matters, in a fixed order. Free text is length prefixed so a
    /// description containing the separator cannot be confused with another field.
    /// </summary>
    private static string CanonicalForm(AuditEntry entry)
    {
        var description = entry.Description ?? string.Empty;
        return string.Join('|',
            entry.ChainIndex.ToString(CultureInfo.InvariantCulture),
            entry.TenantId.ToString(CultureInfo.InvariantCulture),
            entry.UserId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty,
            entry.Action,
            entry.EntityType ?? string.Empty,
            entry.EntityId?.ToString(CultureInfo.InvariantCulture) ?? string.Empty,
            $"{description.Length}:{description}",
            NormalizeTimestamp(entry.CreatedAt).ToString("yyyy-MM-ddTHH:mm:ss.ffffffZ", CultureInfo.InvariantCulture),
            entry.PreviousHash ?? string.Empty);
    }
}

/// <summary>
/// Holds the audit signing key for the lifetime of the application. Initialized at
/// startup (see Data/DatabaseInitializer) from configuration or, as a fallback, from a
/// key generated once and stored in system_settings.
/// </summary>
public sealed class AuditSigningKeyProvider
{
    private AuditHasher? _hasher;

    public AuditSigningKeyProvider()
    {
    }

    public AuditSigningKeyProvider(string secret)
    {
        Initialize(secret);
    }

    public bool IsInitialized => _hasher is not null;

    public AuditHasher Hasher =>
        _hasher ?? throw new InvalidOperationException("The audit signing key has not been initialized.");

    public void Initialize(string secret)
    {
        _hasher = AuditHasher.FromSecret(secret);
    }
}
