using System.Runtime.InteropServices;
using System.Text;
using SebPortal.Api.Batch;

namespace SebPortal.Api.Native;

/// <summary>
/// P/Invoke bindings for native/libcsvparser, following docs/native-csv-usage.md.
/// The struct layouts must match native/libcsvparser/include/csv_parser.h exactly.
/// </summary>
internal static unsafe class LibCsvParser
{
    private const string LibraryName = "libcsvparser";

    private static readonly Lazy<bool> Available = new(() => NativeLibraryProbe.CanLoad(LibraryName, "parse_csv", "free_csv_rows"));

    public static bool IsAvailable => Available.Value;

    [StructLayout(LayoutKind.Sequential)]
    private struct CsvRow
    {
        public int from_account_id;
        public fixed byte to_iban[35];
        public double amount;
        public fixed byte reference[101];
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct CsvResult
    {
        // C bool, one byte. Declared as byte so the struct stays blittable and can
        // be returned by value.
        public byte valid;
        public fixed byte error[256];
        public int row_count;
        public CsvRow* rows;
    }

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern CsvResult parse_csv(byte* content, int contentLength);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern void free_csv_rows(CsvRow* rows);

    public static CsvParseResult Parse(byte[] content, int maxRows)
    {
        CsvResult result;
        fixed (byte* pointer = content)
        {
            result = parse_csv(pointer, content.Length);
        }

        if (result.valid == 0 || result.rows == null)
        {
            var nativeError = ReadString(result.error, 256);
            return CsvParseResult.Failed(TranslateError(nativeError), "native");
        }

        try
        {
            if (result.row_count > maxRows)
            {
                return CsvParseResult.Failed($"Filen innehåller {result.row_count} rader. Max är {maxRows} rader per fil.", "native");
            }

            var rows = new List<CsvPaymentRow>(result.row_count);
            for (var i = 0; i < result.row_count; i++)
            {
                var row = &result.rows[i];

                // The native parser does not report line numbers; data rows start on
                // line 2 (line 1 is the header).
                rows.Add(new CsvPaymentRow(
                    LineNumber: i + 2,
                    FromAccountId: row->from_account_id.ToString(),
                    ToIban: ReadString(row->to_iban, 35).Trim(),
                    Amount: CsvPaymentParser.FormatNativeAmount(row->amount),
                    Reference: ReadString(row->reference, 101).Trim()));
            }

            return new CsvParseResult { Rows = rows, Parser = "native" };
        }
        finally
        {
            free_csv_rows(result.rows);
        }
    }

    private static string ReadString(byte* buffer, int length)
    {
        var span = new ReadOnlySpan<byte>(buffer, length);
        var end = span.IndexOf((byte)0);
        return Encoding.UTF8.GetString(end >= 0 ? span[..end] : span);
    }

    /// <summary>The native module reports errors in English; the portal is in Swedish.</summary>
    private static string TranslateError(string nativeError) => nativeError switch
    {
        "No newline found so header never ended." => "Filen innehåller inga betalningsrader.",
        "Header does not match expected format." => $"Rubrikraden måste vara exakt: {CsvPaymentParser.ExpectedHeader}",
        "CSV contained no rows" => "Filen innehåller inga betalningsrader.",
        "CSV is malformed, contains data after end of quoted field" => "Felaktig citering: text efter ett avslutande citattecken.",
        "CSV is malformed, contains a quote in an unquoted field" => "Felaktig citering: citattecken mitt i ett fält som inte är citerat.",
        "CSV is malformed, missing end quote on quoted field" => "Felaktig citering: ett citerat fält avslutas aldrig.",
        "CSV is malformed, a row doesn't contain the expected value count" => "En rad har fel antal kolumner (förväntade 4). Citera fält som innehåller kommatecken.",
        "CSV is malformed, found a non-numeric account ID" => "Ett konto-ID är inte ett heltal.",
        "CSV is unsupported, found an account ID larger than 9 characters" => "Ett konto-ID är för långt.",
        "CSV is unsupported, found an IBAN longer than 34 characters" => "Ett IBAN är längre än 34 tecken.",
        "CSV is malformed, failed to convert a payment amount" => "Ett belopp kunde inte tolkas som ett tal.",
        "CSV is unsupported, found a reference longer than 100 characters" => "En referens är längre än 100 tecken.",
        "CSV contained a quoted field too long" => "Ett fält är längre än 100 tecken.",
        _ => $"Filen kunde inte tolkas ({nativeError})."
    };
}
