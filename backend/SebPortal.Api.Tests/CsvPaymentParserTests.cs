using System.Text;
using SebPortal.Api.Batch;

namespace SebPortal.Api.Tests;

/// <summary>
/// RFC 4180 parsing of batch files (acceptance criterion: "CSV parse RFC 4180 —
/// testfil med citerade fält, kommanamn, tomrader"). Fixes BUG-004, where v1 split
/// on commas and broke references like "Malmö Bygg, faktura 99".
/// </summary>
public class CsvPaymentParserTests
{
    private const string Header = "from_account_id,to_iban,amount,reference";

    private static CsvParseResult Parse(string csv, int maxRows = 1000) =>
        new CsvPaymentParser(preferNative: false).Parse(Encoding.UTF8.GetBytes(csv), maxRows);

    [Fact]
    public void Parse_ReadsPlainRows()
    {
        var result = Parse($"{Header}\n1,SE3550000000054910000003,5000.00,Faktura #2001\n2,SE0850000000054910000004,12500.00,Faktura #2002\n");

        Assert.True(result.Success, result.Error);
        Assert.Equal("managed", result.Parser);
        Assert.Collection(result.Rows,
            row =>
            {
                Assert.Equal(2, row.LineNumber);
                Assert.Equal("1", row.FromAccountId);
                Assert.Equal("SE3550000000054910000003", row.ToIban);
                Assert.Equal("5000.00", row.Amount);
                Assert.Equal("Faktura #2001", row.Reference);
            },
            row => Assert.Equal(3, row.LineNumber));
    }

    [Fact]
    public void Parse_KeepsCommasInsideQuotedFields()
    {
        var result = Parse($"{Header}\n1,SE3550000000054910000003,5000.00,\"Malmö Bygg, faktura 99\"");

        Assert.True(result.Success, result.Error);
        Assert.Equal("Malmö Bygg, faktura 99", Assert.Single(result.Rows).Reference);
    }

    [Fact]
    public void Parse_UnescapesDoubledQuotes()
    {
        var result = Parse($"{Header}\n1,SE3550000000054910000003,5000.00,\"Projekt \"\"Lundagatan\"\"\"");

        Assert.True(result.Success, result.Error);
        Assert.Equal("Projekt \"Lundagatan\"", Assert.Single(result.Rows).Reference);
    }

    [Fact]
    public void Parse_AllowsLineBreaksInsideQuotedFields_AndCountsLinesCorrectly()
    {
        var result = Parse($"{Header}\r\n1,SE3550000000054910000003,5000.00,\"Rad ett\r\nrad två\"\r\n2,SE0850000000054910000004,10.00,Nästa");

        Assert.True(result.Success, result.Error);
        Assert.Equal("Rad ett\r\nrad två", result.Rows[0].Reference);
        Assert.Equal(2, result.Rows[0].LineNumber);
        Assert.Equal(4, result.Rows[1].LineNumber);
    }

    [Fact]
    public void Parse_SkipsBlankLines()
    {
        var result = Parse($"{Header}\n\n1,SE3550000000054910000003,5000.00,A\n   \n\r\n2,SE0850000000054910000004,10.00,B\n\n");

        Assert.True(result.Success, result.Error);
        Assert.Equal(2, result.Rows.Count);
        Assert.Equal(3, result.Rows[0].LineNumber);
        Assert.Equal(6, result.Rows[1].LineNumber);
    }

    [Theory]
    [InlineData("\n")]
    [InlineData("\r\n")]
    [InlineData("\r")]
    public void Parse_AcceptsAnyLineEnding(string newline)
    {
        var result = Parse($"{Header}{newline}1,SE3550000000054910000003,5000.00,A{newline}2,SE0850000000054910000004,10.00,B");

        Assert.True(result.Success, result.Error);
        Assert.Equal(2, result.Rows.Count);
    }

    [Fact]
    public void Parse_TrimsUnquotedFields_ButKeepsQuotedWhitespace()
    {
        var result = Parse($"{Header}\n 1 , SE3550000000054910000003 , 5000.00 ,\"  mellanslag  \"");

        Assert.True(result.Success, result.Error);
        var row = Assert.Single(result.Rows);
        Assert.Equal("1", row.FromAccountId);
        Assert.Equal("SE3550000000054910000003", row.ToIban);
        Assert.Equal("5000.00", row.Amount);
        Assert.Equal("  mellanslag  ", row.Reference);
    }

    [Fact]
    public void Parse_IgnoresUtf8ByteOrderMark()
    {
        var bytes = Encoding.UTF8.GetPreamble()
            .Concat(Encoding.UTF8.GetBytes($"{Header}\n1,SE3550000000054910000003,5000.00,A"))
            .ToArray();

        var result = new CsvPaymentParser(preferNative: false).Parse(bytes, 1000);

        Assert.True(result.Success, result.Error);
    }

    [Fact]
    public void Parse_AcceptsEmptyReference()
    {
        var result = Parse($"{Header}\n1,SE3550000000054910000003,5000.00,");

        Assert.True(result.Success, result.Error);
        Assert.Equal(string.Empty, Assert.Single(result.Rows).Reference);
    }

    [Theory]
    [InlineData("from_account_id,to_iban,amount")]
    [InlineData("konto,iban,belopp,referens")]
    [InlineData("to_iban,from_account_id,amount,reference")]
    public void Parse_RejectsWrongHeader(string header)
    {
        var result = Parse($"{header}\n1,SE3550000000054910000003,5000.00,A");

        Assert.False(result.Success);
        Assert.Contains("Rubrikraden", result.Error);
    }

    [Fact]
    public void Parse_RejectsUnquotedCommaThatAddsAColumn()
    {
        // Exactly the v1 failure: an unquoted comma in the reference.
        var result = Parse($"{Header}\n1,SE3550000000054910000003,5000.00,Malmö Bygg, faktura 99");

        Assert.False(result.Success);
        Assert.Contains("Rad 2", result.Error);
        Assert.Contains("kolumner", result.Error);
    }

    [Theory]
    [InlineData("1,SE3550000000054910000003,5000.00,\"aldrig avslutad")]
    [InlineData("1,SE3550000000054910000003,5000.00,\"citerad\" text efter")]
    [InlineData("1,SE35500\"00000054910000003,5000.00,A")]
    public void Parse_RejectsBrokenQuoting(string row)
    {
        var result = Parse($"{Header}\n{row}");

        Assert.False(result.Success);
        Assert.False(string.IsNullOrWhiteSpace(result.Error));
    }

    [Theory]
    [InlineData("")]
    [InlineData(Header)]
    [InlineData(Header + "\n\n\n")]
    public void Parse_RejectsFilesWithoutRows(string csv)
    {
        var result = Parse(csv);

        Assert.False(result.Success);
    }

    [Fact]
    public void Parse_RejectsTooManyRows()
    {
        var rows = string.Join("\n", Enumerable.Range(1, 4).Select(i => $"1,SE3550000000054910000003,{i}.00,Rad {i}"));

        var result = Parse($"{Header}\n{rows}", maxRows: 3);

        Assert.False(result.Success);
        Assert.Contains("Max är 3", result.Error);
    }
}
