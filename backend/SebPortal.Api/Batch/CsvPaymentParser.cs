using System.Globalization;
using System.Text;
using SebPortal.Api.Native;

namespace SebPortal.Api.Batch;

/// <summary>One data row from a batch file, still as raw text (validated by BatchPaymentService).</summary>
public sealed record CsvPaymentRow(int LineNumber, string FromAccountId, string ToIban, string Amount, string Reference);

public sealed class CsvParseResult
{
    public bool Success => Error is null;
    public string? Error { get; init; }
    public IReadOnlyList<CsvPaymentRow> Rows { get; init; } = [];
    public string Parser { get; init; } = "managed";

    public static CsvParseResult Failed(string error, string parser) => new() { Error = error, Parser = parser };
}

public interface ICsvPaymentParser
{
    /// <summary>"native" when libcsvparser is loaded, otherwise "managed".</summary>
    string Implementation { get; }

    CsvParseResult Parse(byte[] content, int maxRows);
}

/// <summary>
/// Parses batch payment files with the column layout
/// <c>from_account_id,to_iban,amount,reference</c>. Uses the native RFC 4180 parser
/// (native/libcsvparser) when it is available, otherwise the managed parser below.
/// v1 used string.Split(','), which broke on a reference like "Malmö Bygg, faktura 99" (BUG-004).
/// </summary>
public sealed class CsvPaymentParser : ICsvPaymentParser
{
    public const string ExpectedHeader = "from_account_id,to_iban,amount,reference";

    private static readonly string[] ExpectedColumns = ExpectedHeader.Split(',');

    private readonly bool _useNative;

    public CsvPaymentParser() : this(preferNative: true)
    {
    }

    public CsvPaymentParser(bool preferNative)
    {
        _useNative = preferNative && LibCsvParser.IsAvailable;
    }

    public string Implementation => _useNative ? "native" : "managed";

    public CsvParseResult Parse(byte[] content, int maxRows)
    {
        var withoutBom = StripUtf8Bom(content);

        return _useNative
            ? LibCsvParser.Parse(withoutBom, maxRows)
            : ParseManaged(Encoding.UTF8.GetString(withoutBom), maxRows);
    }

    private static byte[] StripUtf8Bom(byte[] content) =>
        content.Length >= 3 && content[0] == 0xEF && content[1] == 0xBB && content[2] == 0xBF
            ? content[3..]
            : content;

    /// <summary>
    /// RFC 4180 parser: fields may be quoted, quotes inside quoted fields are doubled
    /// (""), quoted fields may contain commas and line breaks, and CRLF, LF or CR end a
    /// record. Blank lines are skipped. Structural problems fail the whole file, so a
    /// batch is never half imported.
    /// </summary>
    public static CsvParseResult ParseManaged(string text, int maxRows)
    {
        var records = new List<(int Line, List<string> Fields)>();
        var fields = new List<string>();
        var field = new StringBuilder();
        var line = 1;
        var recordStartLine = 1;
        var inQuotes = false;
        var fieldWasQuoted = false;
        var afterClosingQuote = false;
        var i = 0;

        void EndField()
        {
            fields.Add(fieldWasQuoted ? field.ToString() : field.ToString().Trim());
            field.Clear();
            fieldWasQuoted = false;
            afterClosingQuote = false;
        }

        void EndRecord()
        {
            EndField();
            var isBlankLine = fields.Count == 1 && fields[0].Length == 0;
            if (!isBlankLine)
            {
                records.Add((recordStartLine, fields.ToList()));
            }
            fields.Clear();
        }

        while (i < text.Length)
        {
            var c = text[i];

            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"')
                    {
                        field.Append('"');
                        i += 2;
                        continue;
                    }
                    inQuotes = false;
                    afterClosingQuote = true;
                    i++;
                    continue;
                }

                if (c == '\n' || (c == '\r' && (i + 1 >= text.Length || text[i + 1] != '\n')))
                {
                    line++;
                }
                field.Append(c);
                i++;
                continue;
            }

            if (c == ',')
            {
                EndField();
                i++;
                continue;
            }

            if (c == '\r' || c == '\n')
            {
                EndRecord();
                i += c == '\r' && i + 1 < text.Length && text[i + 1] == '\n' ? 2 : 1;
                line++;
                recordStartLine = line;
                continue;
            }

            if (afterClosingQuote)
            {
                if (char.IsWhiteSpace(c))
                {
                    i++;
                    continue;
                }
                return CsvParseResult.Failed($"Rad {line}: text efter ett avslutande citattecken.", "managed");
            }

            if (c == '"')
            {
                if (field.ToString().Trim().Length > 0)
                {
                    return CsvParseResult.Failed($"Rad {line}: citattecken mitt i ett fält som inte är citerat.", "managed");
                }
                field.Clear();
                inQuotes = true;
                fieldWasQuoted = true;
                i++;
                continue;
            }

            field.Append(c);
            i++;
        }

        if (inQuotes)
        {
            return CsvParseResult.Failed($"Rad {recordStartLine}: ett citerat fält avslutas aldrig.", "managed");
        }

        if (field.Length > 0 || fields.Count > 0 || fieldWasQuoted)
        {
            EndRecord();
        }

        if (records.Count == 0)
        {
            return CsvParseResult.Failed("Filen är tom.", "managed");
        }

        var header = records[0].Fields.Select(h => h.Trim()).ToList();
        if (!header.SequenceEqual(ExpectedColumns, StringComparer.OrdinalIgnoreCase))
        {
            return CsvParseResult.Failed($"Rubrikraden måste vara exakt: {ExpectedHeader}", "managed");
        }

        var dataRecords = records.Skip(1).ToList();
        if (dataRecords.Count == 0)
        {
            return CsvParseResult.Failed("Filen innehåller inga betalningsrader.", "managed");
        }

        if (dataRecords.Count > maxRows)
        {
            return CsvParseResult.Failed($"Filen innehåller {dataRecords.Count} rader. Max är {maxRows} rader per fil.", "managed");
        }

        var rows = new List<CsvPaymentRow>(dataRecords.Count);
        foreach (var (recordLine, values) in dataRecords)
        {
            if (values.Count != ExpectedColumns.Length)
            {
                return CsvParseResult.Failed(
                    $"Rad {recordLine}: förväntade {ExpectedColumns.Length} kolumner men hittade {values.Count}. " +
                    "Citera fält som innehåller kommatecken.",
                    "managed");
            }

            rows.Add(new CsvPaymentRow(recordLine, values[0], values[1], values[2], values[3]));
        }

        return new CsvParseResult { Rows = rows, Parser = "managed" };
    }

    /// <summary>Formats an amount from the native parser (a double) without losing the decimals.</summary>
    internal static string FormatNativeAmount(double amount) =>
        amount.ToString("R", CultureInfo.InvariantCulture);
}
