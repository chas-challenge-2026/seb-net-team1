using System.Globalization;

namespace SebPortal.Api.Services;

/// <summary>Money formatting in one place.</summary>
public static class Money
{
    private static readonly CultureInfo Swedish = CultureInfo.GetCultureInfo("sv-SE");

    /// <summary>API format: a decimal string with two decimals, never a float ("12500.00").</summary>
    public static string Format(decimal amount) =>
        amount.ToString("F2", CultureInfo.InvariantCulture);

    /// <summary>Human readable Swedish format for texts such as notifications ("12 500,00").</summary>
    public static string Display(decimal amount) =>
        amount.ToString("N2", Swedish);

    /// <summary>
    /// Parses an amount from the API or a CSV file: dot or comma as decimal separator,
    /// no thousands separators, at most two decimals.
    /// </summary>
    public static bool TryParse(string? text, out decimal amount)
    {
        amount = 0m;
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        var normalized = text.Trim().Replace(" ", string.Empty).Replace(' '.ToString(), string.Empty);
        if (normalized.Contains(',') && !normalized.Contains('.'))
        {
            normalized = normalized.Replace(',', '.');
        }

        return decimal.TryParse(normalized, NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingSign,
                   CultureInfo.InvariantCulture, out amount)
               && decimal.Round(amount, 2) == amount;
    }
}
