using System.Text;
using SebPortal.Api.Native;

namespace SebPortal.Api.Validation;

/// <summary>Error codes shared with the native libiban module (native/libiban).</summary>
public enum IbanErrorCode
{
    None = 0,
    InvalidLength = 1,
    InvalidCountry = 2,
    InvalidCharacter = 3,
    InvalidChecksum = 4
}

public sealed record IbanValidationResult(
    bool IsValid,
    string Normalized,
    string Formatted,
    string? CountryCode,
    IbanErrorCode ErrorCode)
{
    public string Message => ErrorCode switch
    {
        IbanErrorCode.None => "Giltigt IBAN.",
        IbanErrorCode.InvalidLength => "IBAN har fel längd för landet.",
        IbanErrorCode.InvalidCountry => "IBAN har en okänd landskod.",
        IbanErrorCode.InvalidCharacter => "IBAN får bara innehålla bokstäver A–Z och siffror.",
        _ => "IBAN:ets kontrollsiffror stämmer inte (MOD97)."
    };
}

public interface IIbanValidator
{
    /// <summary>"native" when libiban is loaded, otherwise "managed".</summary>
    string Implementation { get; }

    IbanValidationResult Validate(string? iban);

    bool IsValidBic(string? bic);
}

/// <summary>
/// ISO 13616 IBAN validation with the MOD97 check (fixes BUG-003, where v1 only
/// checked the format with a regex). Uses the native libiban module when it is
/// available (built into the Docker image) and falls back to the equivalent managed
/// implementation otherwise, e.g. on a Windows development machine.
/// </summary>
public sealed class IbanValidator : IIbanValidator
{
    private readonly bool _useNative;

    public IbanValidator() : this(preferNative: true)
    {
    }

    public IbanValidator(bool preferNative)
    {
        _useNative = preferNative && LibIban.IsAvailable;
    }

    public string Implementation => _useNative ? "native" : "managed";

    public IbanValidationResult Validate(string? iban)
    {
        var normalized = Normalize(iban);
        var countryCode = normalized.Length >= 2 && char.IsAsciiLetterUpper(normalized[0]) && char.IsAsciiLetterUpper(normalized[1])
            ? normalized[..2]
            : null;

        var errorCode = _useNative
            ? LibIban.Validate(normalized)
            : ValidateManaged(normalized);

        return new IbanValidationResult(
            errorCode == IbanErrorCode.None,
            normalized,
            Format(normalized),
            countryCode,
            errorCode);
    }

    public bool IsValidBic(string? bic)
    {
        var normalized = (bic ?? string.Empty).Trim().ToUpperInvariant();
        return _useNative ? LibIban.ValidateBic(normalized) : IsValidBicManaged(normalized);
    }

    /// <summary>Removes spaces and upper cases, so "se45 5000 ..." is accepted.</summary>
    public static string Normalize(string? iban) =>
        new string((iban ?? string.Empty).Where(c => !char.IsWhiteSpace(c)).ToArray()).ToUpperInvariant();

    /// <summary>Groups the IBAN in blocks of four for display.</summary>
    public static string Format(string normalized)
    {
        var builder = new StringBuilder(normalized.Length + normalized.Length / 4);
        for (var i = 0; i < normalized.Length; i++)
        {
            if (i > 0 && i % 4 == 0)
            {
                builder.Append(' ');
            }
            builder.Append(normalized[i]);
        }
        return builder.ToString();
    }

    internal static IbanErrorCode ValidateManaged(string iban)
    {
        if (iban.Length < 15 || iban.Length > 34)
        {
            return IbanErrorCode.InvalidLength;
        }

        if (iban.Any(c => !char.IsAsciiLetterUpper(c) && !char.IsAsciiDigit(c)))
        {
            return IbanErrorCode.InvalidCharacter;
        }

        if (!IbanRegistry.TryGetLength(iban[..2], out var expectedLength))
        {
            return IbanErrorCode.InvalidCountry;
        }

        if (!char.IsAsciiDigit(iban[2]) || !char.IsAsciiDigit(iban[3]))
        {
            return IbanErrorCode.InvalidCharacter;
        }

        if (iban.Length != expectedLength)
        {
            return IbanErrorCode.InvalidLength;
        }

        return Mod97(iban) == 1 ? IbanErrorCode.None : IbanErrorCode.InvalidChecksum;
    }

    /// <summary>
    /// ISO 13616 MOD97: move the first four characters to the end, replace every
    /// letter with two digits (A = 10 ... Z = 35) and take the remainder modulo 97.
    /// Computed piece by piece so no big integer is needed.
    /// </summary>
    public static int Mod97(string iban)
    {
        var remainder = 0;
        foreach (var c in iban[4..] + iban[..4])
        {
            remainder = char.IsAsciiDigit(c)
                ? (remainder * 10 + (c - '0')) % 97
                : (remainder * 100 + (c - 'A' + 10)) % 97;
        }
        return remainder;
    }

    /// <summary>ISO 9362: 4 letter bank code, 2 letter country, 2 alphanumeric location, optional 3 alphanumeric branch.</summary>
    internal static bool IsValidBicManaged(string bic)
    {
        if (bic.Length is not (8 or 11))
        {
            return false;
        }

        for (var i = 0; i < bic.Length; i++)
        {
            var c = bic[i];
            var valid = i < 6 ? char.IsAsciiLetterUpper(c) : char.IsAsciiLetterUpper(c) || char.IsAsciiDigit(c);
            if (!valid)
            {
                return false;
            }
        }

        return true;
    }
}

/// <summary>
/// IBAN lengths per country from the SWIFT IBAN Registry. Same table as
/// native/libiban/include/iban_registry.h so both implementations agree.
/// </summary>
public static class IbanRegistry
{
    private static readonly Dictionary<string, int> Lengths = new(StringComparer.Ordinal)
    {
        ["AD"] = 24, ["AE"] = 23, ["AL"] = 28, ["AT"] = 20, ["AZ"] = 28,
        ["BA"] = 20, ["BE"] = 16, ["BG"] = 22, ["BH"] = 22, ["BI"] = 27, ["BR"] = 29, ["BY"] = 28,
        ["CH"] = 21, ["CR"] = 22, ["CY"] = 28, ["CZ"] = 24,
        ["DE"] = 22, ["DJ"] = 27, ["DK"] = 18, ["DO"] = 28,
        ["EE"] = 20, ["EG"] = 29, ["ES"] = 24,
        ["FI"] = 18, ["FK"] = 18, ["FO"] = 18, ["FR"] = 27,
        ["GB"] = 22, ["GE"] = 22, ["GI"] = 23, ["GL"] = 18, ["GR"] = 27, ["GT"] = 28,
        ["HN"] = 28, ["HR"] = 21, ["HU"] = 28,
        ["IE"] = 22, ["IL"] = 23, ["IQ"] = 23, ["IS"] = 26, ["IT"] = 27,
        ["JO"] = 30,
        ["KW"] = 30, ["KZ"] = 20,
        ["LB"] = 28, ["LC"] = 32, ["LI"] = 21, ["LT"] = 20, ["LU"] = 20, ["LV"] = 21, ["LY"] = 25,
        ["MC"] = 27, ["MD"] = 24, ["ME"] = 22, ["MK"] = 19, ["MN"] = 20, ["MR"] = 27, ["MT"] = 31, ["MU"] = 30,
        ["NI"] = 28, ["NL"] = 18, ["NO"] = 15,
        ["OM"] = 23,
        ["PK"] = 24, ["PL"] = 28, ["PS"] = 29, ["PT"] = 25,
        ["QA"] = 29,
        ["RO"] = 24, ["RS"] = 22, ["RU"] = 33,
        ["SA"] = 24, ["SC"] = 31, ["SD"] = 18, ["SE"] = 24, ["SI"] = 19, ["SK"] = 24, ["SM"] = 27,
        ["SO"] = 23, ["ST"] = 25, ["SV"] = 28,
        ["TL"] = 23, ["TN"] = 24, ["TR"] = 26,
        ["UA"] = 29,
        ["VA"] = 22, ["VG"] = 24,
        ["XK"] = 20,
        ["YE"] = 30,
    };

    public static bool TryGetLength(string countryCode, out int length) =>
        Lengths.TryGetValue(countryCode, out length);
}
