using System.Globalization;
using System.Text;

namespace SebPortal.Api.Services;

/// <summary>
/// Wraps libcsvparser so the rest of the API never touches native memory or pointers.
/// See docs/native-csv-usage.md.
/// </summary>
public static class BatchCsvParser
{
    /// <summary>
    /// Parses the CSV bytes and copies the rows into managed objects, so the native
    /// memory is freed before this method returns. The parser drops partial results:
    /// it returns either every row or only an error.
    /// </summary>
    /// <returns>The rows on success, otherwise null rows and the parser's error message.</returns>
    public static unsafe (List<BatchPaymentRow>? Rows, string? Error) Parse(byte[] content)
    {
        var result = NativeProvider.CSV.parse_csv(content, content.Length);

        if (!result.valid)
        {
            // rows is null here, so there is nothing to free.
            return (null, Encoding.UTF8.GetString(result.error, 256).TrimEnd('\0'));
        }

        try
        {
            var rows = new List<BatchPaymentRow>(result.row_count);

            for (var i = 0; i < result.row_count; i++)
            {
                var row = &result.rows[i];

                rows.Add(new BatchPaymentRow(
                    row->from_account_id,
                    Encoding.UTF8.GetString(row->to_iban, 35).TrimEnd('\0'),
                    ToAmount(row->amount),
                    row->amount.ToString(CultureInfo.InvariantCulture),
                    Encoding.UTF8.GetString(row->reference, 101).TrimEnd('\0')));
            }

            return (rows, null);
        }
        finally
        {
            if (result.rows != null)
            {
                NativeProvider.CSV.free_csv_rows(result.rows);
            }
        }
    }

    /// <summary>
    /// The parser accepts any number it can read, but casting NaN, infinity or a huge
    /// value to decimal throws. Those become null, which the validation reports as a
    /// row error instead of failing the whole request.
    /// </summary>
    private static decimal? ToAmount(double value)
    {
        if (!double.IsFinite(value) || Math.Abs(value) >= 1e15)
        {
            return null;
        }

        return Math.Round((decimal)value, 2);
    }
}

/// <summary>
/// One data row of an uploaded batch file, copied out of the native parser's memory.
/// </summary>
/// <param name="FromAccountId">Account to pay from.</param>
/// <param name="ToIban">Recipient IBAN exactly as written in the file.</param>
/// <param name="Amount">
/// Amount rounded to 2 decimals, or null when the parsed number cannot be represented
/// as a decimal (infinite, NaN or far outside any real amount).
/// </param>
/// <param name="AmountText">The amount as the parser read it, kept for <see cref="Content"/>.</param>
/// <param name="Reference">Payment reference, empty when the file left it blank.</param>
public sealed record BatchPaymentRow(
    int FromAccountId,
    string ToIban,
    decimal? Amount,
    string AmountText,
    string Reference)
{
    /// <summary>
    /// The row rebuilt from the parsed fields, shown to the user when the row is
    /// invalid. The native parser does not hand back the original line.
    /// </summary>
    public string Content => $"{FromAccountId},{ToIban},{AmountText},{Reference}";
}
