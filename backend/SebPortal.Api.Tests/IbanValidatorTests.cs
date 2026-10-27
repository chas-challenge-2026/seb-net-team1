using SebPortal.Api.Validation;

namespace SebPortal.Api.Tests;

/// <summary>
/// ISO 13616 / MOD97 validation (acceptance criterion: "IBAN MOD97 korrekt,
/// parameteriserad testsvit med 50 kända IBAN:er"). The known IBANs are the
/// published example IBANs from the SWIFT IBAN Registry, one per country.
/// Runs against the managed implementation; the native libiban has its own C tests.
/// </summary>
public class IbanValidatorTests
{
    private static readonly IbanValidator Validator = new(preferNative: false);

    public static readonly TheoryData<string> KnownValidIbans = new()
    {
        "AD1200012030200359100100", "AE070331234567890123456", "AL47212110090000000235698741",
        "AT611904300234573201", "AZ21NABZ00000000137010001944", "BA391290079401028494",
        "BE68539007547034", "BG80BNBG96611020345678", "BH67BMAG00001299123456",
        "BR1800360305000010009795493C1", "BY13NBRB3600900000002Z00AB00", "CH9300762011623852957",
        "CR05015202001026284066", "CY17002001280000001200527600", "CZ6508000000192000145399",
        "DE89370400440532013000", "DK5000400440116243", "DO28BAGR00000001212453611324",
        "EE382200221020145685", "EG380019000500000000263180002", "ES9121000418450200051332",
        "FI2112345600000785", "FO6264600001631634", "FR1420041010050500013M02606",
        "GB29NWBK60161331926819", "GE29NB0000000101904917", "GI75NWBK000000007099453",
        "GL8964710001000206", "GR1601101250000000012300695", "GT82TRAJ01020000001210029690",
        "HR1210010051863000160", "HU42117730161111101800000000", "IE29AIBK93115212345678",
        "IL620108000000099999999", "IQ98NBIQ850123456789012", "IS140159260076545510730339",
        "IT60X0542811101000000123456", "JO94CBJO0010000000000131000302", "KW81CBKU0000000000001234560101",
        "KZ86125KZT5004100100", "LB62099900000001001901229114", "LC55HEMM000100010012001200023015",
        "LI21088100002324013AA", "LT121000011101001000", "LU280019400644750000",
        "LV80BANK0000435195001", "MC5811222000010123456789030", "MD24AG000225100013104168",
        "ME25505000012345678951", "MK07250120000058984", "MR1300020001010000123456753",
        "MT84MALT011000012345MTLCAST001S", "MU17BOMM0101101030300200000MUR", "NL91ABNA0417164300",
        "NO9386011117947", "PK36SCBL0000001123456702", "PL61109010140000071219812874",
        "PS92PALS000000000400123456702", "PT50000201231234567890154", "QA58DOHB00001234567890ABCDEFG",
        "RO49AAAA1B31007593840000", "RS35260005601001611379", "SA0380000000608010167519",
        "SC18SSCB11010000000000001497USD", "SE4550000000058398257466", "SI56263300012039086",
        "SK3112000000198742637541", "SM86U0322509800000000270100", "ST68000100010051845310112",
        "SV62CENR00000000000000700025", "TL380080012345678910157", "TN5910006035183598478831",
        "TR330006100519786457841326", "UA213223130000026007233566001", "VA59001123000012345678",
        "VG96VPVG0000012345678901", "XK051212012345678906",
    };

    [Theory]
    [MemberData(nameof(KnownValidIbans))]
    public void Validate_AcceptsKnownValidIban(string iban)
    {
        var result = Validator.Validate(iban);

        Assert.True(result.IsValid, $"{iban}: {result.ErrorCode}");
        Assert.Equal(IbanErrorCode.None, result.ErrorCode);
        Assert.Equal(1, IbanValidator.Mod97(iban));
    }

    [Theory]
    [MemberData(nameof(KnownValidIbans))]
    public void Validate_RejectsKnownIbanWithWrongCheckDigits(string iban)
    {
        // Changing the check digits of a valid IBAN must always be caught by MOD97.
        var checkDigits = int.Parse(iban.Substring(2, 2));
        var wrong = iban[..2] + ((checkDigits + 1) % 100).ToString("00") + iban[4..];

        var result = Validator.Validate(wrong);

        Assert.False(result.IsValid);
        Assert.Equal(IbanErrorCode.InvalidChecksum, result.ErrorCode);
    }

    [Theory]
    [InlineData("SE4550000000058398257467")] // last digit changed
    [InlineData("SE4550000000058398257476")] // two digits swapped
    [InlineData("SE8550000000054910000003")] // v1 seed data (BUG-003): right format, wrong checksum
    [InlineData("SE4550000000054910000099")]
    public void Validate_RejectsCorrectlyFormattedIbanWithBadChecksum(string iban)
    {
        var result = Validator.Validate(iban);

        Assert.False(result.IsValid);
        Assert.Equal(IbanErrorCode.InvalidChecksum, result.ErrorCode);
    }

    [Theory]
    [InlineData("", IbanErrorCode.InvalidLength)]
    [InlineData("SE45", IbanErrorCode.InvalidLength)]
    [InlineData("SE455000000005839825746", IbanErrorCode.InvalidLength)] // one character short for SE
    [InlineData("SE45500000000583982574661", IbanErrorCode.InvalidLength)] // one too many for SE
    [InlineData("SE45500000000583982574661234567890", IbanErrorCode.InvalidLength)]
    [InlineData("SE455000000005839825746!", IbanErrorCode.InvalidCharacter)]
    [InlineData("SE4550000000058398257-66", IbanErrorCode.InvalidCharacter)]
    [InlineData("SEX550000000058398257466", IbanErrorCode.InvalidCharacter)]
    [InlineData("ZZ4550000000058398257466", IbanErrorCode.InvalidCountry)]
    [InlineData("US4550000000058398257466", IbanErrorCode.InvalidCountry)]
    public void Validate_ReportsTheRightErrorCode(string iban, IbanErrorCode expected)
    {
        var result = Validator.Validate(iban);

        Assert.False(result.IsValid);
        Assert.Equal(expected, result.ErrorCode);
        Assert.False(string.IsNullOrWhiteSpace(result.Message));
    }

    [Fact]
    public void Validate_IgnoresSpacesAndCase_AndFormatsInGroupsOfFour()
    {
        var result = Validator.Validate("  se45 5000 0000 0583 9825 7466 ");

        Assert.True(result.IsValid);
        Assert.Equal("SE4550000000058398257466", result.Normalized);
        Assert.Equal("SE45 5000 0000 0583 9825 7466", result.Formatted);
        Assert.Equal("SE", result.CountryCode);
    }

    [Fact]
    public void Validate_HandlesNull()
    {
        var result = Validator.Validate(null);

        Assert.False(result.IsValid);
        Assert.Equal(IbanErrorCode.InvalidLength, result.ErrorCode);
    }

    [Theory]
    [InlineData("ESSESESS", true)]
    [InlineData("ESSESESSXXX", true)]
    [InlineData("DEUTDEFF500", true)]
    [InlineData("essesess", true)] // normalized to upper case
    [InlineData("ESSESES", false)]
    [InlineData("ESSESESSXX", false)]
    [InlineData("ESS1SESS", false)] // bank code must be letters
    [InlineData("ESSES1SS", false)] // country code must be letters
    [InlineData("ESSESE$S", false)]
    [InlineData("", false)]
    public void IsValidBic_FollowsIso9362(string bic, bool expected)
    {
        Assert.Equal(expected, Validator.IsValidBic(bic));
    }
}
