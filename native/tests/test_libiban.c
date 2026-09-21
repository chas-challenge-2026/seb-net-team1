#include <stdio.h>
#include <stdbool.h>

#include "iban_validator.h"
#include "iban_registry.h"
#define SE_IBAN "SE4550000000058398257466"
#define SE_IBAN_SPACED "SE45 5000 0000 0583 9825 7466"
#define SE_IBAN_BAD_CHECKSUM "SE8550000000054910000003"

#include "test_macros.h"

// One example IBAN per country from the SWIFT IBAN Registry (Release 103, Sep 2026), in the same order as the countries table.
static const char* registry_examples[] = {
    "AD1200012030200359100100",
    "AE070331234567890123456",
    "AL47212110090000000235698741",
    "AT611904300234573201",
    "AZ21NABZ00000000137010001944",
    "BA391290079401028494",
    "BE68539007547034",
    "BG80BNBG96611020345678",
    "BH67BMAG00001299123456",
    "BI4210000100010000332045181",
    "BR6699999A03000010009795493C1",
    "BY13NBRB3600900000002Z00AB00",
    "CH9300762011623852957",
    "CR05015202001026284066",
    "CY17002001280000001200527600",
    "CZ6508000000192000145399",
    "DE89370400440532013000",
    "DJ2100010000000154000100186",
    "DK5000400440116243",
    "DO28BAGR00000001212453611324",
    "EE382200221020145685",
    "EG380019000500000000263180002",
    "ES9121000418450200051332",
    "FI2112345600000785",
    "FK88SC123456789012",
    "FO6264600001631634",
    "FR1420041010050500013M02606",
    "GB29NWBK60161331926819",
    "GE29NB0000000101904917",
    "GI75NWBK000000007099453",
    "GL8964710001000206",
    "GR1601101250000000012300695",
    "GT82TRAJ01020000001210029690",
    "HN88CABF00000000000250005469",
    "HR1210010051863000160",
    "HU42117730161111101800000000",
    "IE29AIBK93115212345678",
    "IL620108000000099999999",
    "IQ98NBIQ850123456789012",
    "IS140159260076545510730339",
    "IT60X0542811101000000123456",
    "JO94CBJO0010000000000131000302",
    "KW81CBKU0000000000001234560101",
    "KZ86125KZT5004100100",
    "LB62099900000001001901229114",
    "LC55HEMM000100010012001200023015",
    "LI21088100002324013AA",
    "LT121000011101001000",
    "LU280019400644750000",
    "LV80BANK0000435195001",
    "LY83002048000020100120361",
    "MC5811222000010123456789030",
    "MD24AG000225100013104168",
    "ME25505000012345678951",
    "MK07250120000058984",
    "MN121234123456789123",
    "MR1300020001010000123456753",
    "MT84MALT011000012345MTLCAST001S",
    "MU17BOMM0101101030300200000MUR",
    "NI45BAPR00000013000003558124",
    "NL91ABNA0417164300",
    "NO9386011117947",
    "OM810180000001299123456",
    "PK36SCBL0000001123456702",
    "PL61109010140000071219812874",
    "PS92PALS000000000400123456702",
    "PT50000201231234567890154",
    "QA58DOHB00001234567890ABCDEFG",
    "RO49AAAA1B31007593840000",
    "RS35260005601001611379",
    "RU0304452522540817810538091310419",
    "SA0380000000608010167519",
    "SC18SSCB11010000000000001497USD",
    "SD2129010501234001",
    "SE4550000000058398257466",
    "SI56263300012039086",
    "SK3112000000198742637541",
    "SM86U0322509800000000270100",
    "SO211000001001000100141",
    "ST23000100010051845310146",
    "SV62CENR00000000000000700025",
    "TL380080012345678910157",
    "TN5910006035183598478831",
    "TR330006100519786457841326",
    "UA213223130000026007233566001",
    "VA59001123000012345678",
    "VG96VPVG0000012345678901",
    "XK051212012345678906",
    "YE15CBYE0001018861234567891234",
};
#define EXAMPLE_COUNT (sizeof registry_examples / sizeof registry_examples[0])

// Runs validate_iban and returns 0 if the IBAN was accepted, otherwise the error code.
static int error_of(const char* iban) {
    int error = -1;
    if(validate_iban(iban, &error) == 1)
        return 0;
    return error;
}

// Copies an IBAN and replaces the character at index with symbol.
static void replace_char(const char* iban, int index, char symbol, char* out) {
    strcpy(out, iban);
    out[index] = symbol;
}

// Turns an IBAN in electronic format into print format, groups of four separated by a space.
static void group_by_four(const char* iban, char* out) {
    int o = 0;
    for(int i = 0; iban[i] != '\0'; i++) {
        if(i > 0 && i % 4 == 0)
            out[o++] = ' ';
        out[o++] = iban[i];
    }
    out[o] = '\0';
}

int test_valid_iban() {
    int error = -1;
    TEST_ASSERT(validate_iban(SE_IBAN, &error) == 1, "validator rejected a valid IBAN, error code %d", error);
    TEST_ASSERT(validate_iban(SE_IBAN_SPACED, &error) == 1, "validator rejected a valid IBAN in print format, error code %d", error);
    TEST_ASSERT(validate_iban("GB82WEST12345698765432", &error) == 1, "validator rejected a valid IBAN with letters in the BBAN, error code %d", error);
    return 0;
}

int test_registry_table_matches_examples() {
    TEST_ASSERT(EXAMPLE_COUNT == IBAN_COUNTRY_COUNT, "country table has %d countries but the tests have %d examples", (int)IBAN_COUNTRY_COUNT, (int)EXAMPLE_COUNT);
    for(size_t i = 0; i < EXAMPLE_COUNT; i++) {
        TEST_ASSERT(strncmp(registry_examples[i], countries[i].code, 2) == 0, "example %s does not belong to table entry %.2s", registry_examples[i], countries[i].code);
        TEST_ASSERT(strlen(registry_examples[i]) == countries[i].expected_length, "%s has %d characters but the table expects %d", registry_examples[i], (int)strlen(registry_examples[i]), countries[i].expected_length);
    }
    return 0;
}

int test_registry_examples_valid() {
    char spaced[64];
    for(size_t i = 0; i < EXAMPLE_COUNT; i++) {
        int error = error_of(registry_examples[i]);
        TEST_ASSERT(error == 0, "validator rejected registry example %s, error code %d", registry_examples[i], error);
        group_by_four(registry_examples[i], spaced);
        error = error_of(spaced);
        TEST_ASSERT(error == 0, "validator rejected registry example '%s' in print format, error code %d", spaced, error);
    }
    return 0;
}

int test_checksum_error() {
    int error = -1;
    TEST_ASSERT(validate_iban(SE_IBAN_BAD_CHECKSUM, &error) == 0, "validator accepted an IBAN with wrong check digits");
    TEST_ASSERT(error == 4, "wrong check digits returned error code %d instead of 4", error);
    return 0;
}

int test_single_digit_errors() {
    char buf[64];
    int len = (int)strlen(SE_IBAN);
    for(int i = 2; i < len; i++) {
        char changed = '0' + (SE_IBAN[i] - '0' + 1) % 10;
        replace_char(SE_IBAN, i, changed, buf);
        TEST_ASSERT(error_of(buf) == 4, "validator missed a changed digit at index %d in %s", i, buf);
    }
    return 0;
}

int test_letters_in_bban() {
    char buf[64];
    int len = (int)strlen(SE_IBAN);
    for(int i = 4; i < len; i++) {
        replace_char(SE_IBAN, i, 'A', buf);
        int error = error_of(buf);
        TEST_ASSERT(error == 4, "a letter in the BBAN at index %d in %s returned error code %d instead of 4", i, buf, error);
    }
    return 0;
}

int test_invalid_length() {
    const char tooLong[] = SE_IBAN SE_IBAN SE_IBAN SE_IBAN;
    TEST_ASSERT(error_of("") == 1, "validator did not reject an empty string with error 1");
    TEST_ASSERT(error_of("SE") == 1, "validator did not reject a 2 character string with error 1");
    TEST_ASSERT(error_of("SE455000000005839825746") == 1, "validator did not reject an SE IBAN one character short with error 1");
    TEST_ASSERT(error_of("SE45500000000583982574666") == 1, "validator did not reject an SE IBAN one character long with error 1");
    TEST_ASSERT(error_of("GB82WEST1234569876543") == 1, "validator did not reject a GB IBAN one character short with error 1");
    TEST_ASSERT(error_of("GB82WEST123456987654322") == 1, "validator did not reject a GB IBAN one character long with error 1");
    TEST_ASSERT(error_of(tooLong) == 1, "validator did not reject a 96 character string with error 1");
    return 0;
}

int test_unknown_country() {
    char buf[64];
    TEST_ASSERT(error_of("XX4550000000058398257466") == 2, "validator did not reject an unknown country code with error 2");
    TEST_ASSERT(error_of("se4550000000058398257466") == 2, "validator did not reject a lowercase country code with error 2");
    TEST_ASSERT(error_of("4550000000058398257466SE") == 2, "validator did not reject a country code made of digits with error 2");
    for(int i = 0; i < 2; i++) {
        replace_char(SE_IBAN, i, '-', buf);
        TEST_ASSERT(error_of(buf) == 2, "validator did not reject a broken country code in %s with error 2", buf);
    }
    return 0;
}

int test_invalid_characters() {
    const char badChars[] = { '-', 'a', '.', '\t', '\xC3' };
    char buf[64];
    int len = (int)strlen(SE_IBAN);
    for(int c = 0; c < (int)sizeof(badChars); c++) {
        for(int i = 2; i < len; i++) {
            replace_char(SE_IBAN, i, badChars[c], buf);
            int error = error_of(buf);
            TEST_ASSERT(error == 3, "'%s' should return error 3 but returned %d", buf, error);
        }
    }
    // Letters are fine in the BBAN but not in the check digits
    for(int i = 2; i < 4; i++) {
        replace_char(SE_IBAN, i, 'A', buf);
        int error = error_of(buf);
        TEST_ASSERT(error == 3, "a letter in the check digits '%s' should return error 3 but returned %d", buf, error);
    }
    return 0;
}

int test_spaced_iban_errors() {
    char buf[64];
    int len = (int)strlen(SE_IBAN_SPACED);
    TEST_ASSERT(error_of("SE85 5000 0000 0549 1000 0003") == 4, "validator did not reject wrong check digits in print format with error 4");
    TEST_ASSERT(error_of("SE45 5000 0000 0583 9825 7466 1") == 1, "validator did not reject a too long IBAN in print format with error 1");
    TEST_ASSERT(error_of("SE45 5000 0000 0583 9825 746") == 1, "validator did not reject a too short IBAN in print format with error 1");
    // A bad character anywhere must be found, including the last characters
    for(int i = 0; i < len; i++) {
        if(SE_IBAN_SPACED[i] == ' ')
            continue;
        replace_char(SE_IBAN_SPACED, i, '-', buf);
        int expected = i < 2 ? 2 : 3;
        int error = error_of(buf);
        TEST_ASSERT(error == expected, "'%s' should return error %d but returned %d", buf, expected, error);
    }
    return 0;
}

int test_error_precedence() {
    TEST_ASSERT(error_of("XX45-0000000058398257466") == 2, "an unknown country and a bad character should return error 2");
    TEST_ASSERT(error_of("SE45-000000005839825746") == 1, "a wrong length and a bad character should return error 1");
    TEST_ASSERT(error_of("SE855000000005491000000-") == 3, "a bad character and wrong check digits should return error 3");
    return 0;
}

int test_null_error_out() {
    TEST_ASSERT(validate_iban(SE_IBAN, NULL) == 1, "validator failed on a valid IBAN when error_out was NULL");
    TEST_ASSERT(validate_iban("SE455000000005839825746", NULL) == 0, "validator accepted a wrong length when error_out was NULL");
    TEST_ASSERT(validate_iban("XX4550000000058398257466", NULL) == 0, "validator accepted an unknown country when error_out was NULL");
    TEST_ASSERT(validate_iban("SE4A50000000058398257466", NULL) == 0, "validator accepted a bad character when error_out was NULL");
    TEST_ASSERT(validate_iban(SE_IBAN_BAD_CHECKSUM, NULL) == 0, "validator accepted wrong check digits when error_out was NULL");
    return 0;
}

int test_mod97() {
    TEST_ASSERT(iban_mod97(SE_IBAN) == 1, "MOD97 of a valid IBAN was not 1");
    TEST_ASSERT(iban_mod97(SE_IBAN_SPACED) == 1, "MOD97 of a valid IBAN in print format was not 1");
    TEST_ASSERT(iban_mod97("GB82WEST12345698765432") == 1, "MOD97 of a valid IBAN with letters was not 1");
    int remainder = iban_mod97(SE_IBAN_BAD_CHECKSUM);
    TEST_ASSERT(remainder == 51, "MOD97 of an IBAN with wrong check digits was %d instead of 51", remainder);
    return 0;
}

// BICs without a branch code (8 characters) and with one (11 characters). ESSESESS is used in the mock payments.
#define BIC_SHORT "ESSESESS"
#define BIC_LONG "DEUTDEFF500"

int test_valid_bic() {
    TEST_ASSERT(validate_bic("ESSESESS") == 1, "validator rejected the mock BIC ESSESESS");
    TEST_ASSERT(validate_bic("SWEDSESS") == 1, "validator rejected the mock BIC SWEDSESS");
    TEST_ASSERT(validate_bic("DEUTDEFF") == 1, "validator rejected the BIC DEUTDEFF");
    TEST_ASSERT(validate_bic("CHASUS33") == 1, "validator rejected a BIC with digits in the location code");
    TEST_ASSERT(validate_bic("DEUTDEFF500") == 1, "validator rejected a BIC with a branch code");
    TEST_ASSERT(validate_bic("DEUTDEFFXXX") == 1, "validator rejected a BIC with the primary office branch code XXX");
    // ISO 9362:2014 allows digits in the bank code, older rules only allowed letters
    TEST_ASSERT(validate_bic("1234SESS") == 1, "validator rejected a BIC with digits in the bank code");
    return 0;
}

int test_bic_invalid_length() {
    const char tooLong[] = BIC_LONG BIC_LONG BIC_LONG BIC_LONG;
    TEST_ASSERT(validate_bic("") == 0, "validator accepted an empty BIC");
    TEST_ASSERT(validate_bic("ESSESES") == 0, "validator accepted a 7 character BIC");
    TEST_ASSERT(validate_bic("ESSESESS1") == 0, "validator accepted a 9 character BIC");
    TEST_ASSERT(validate_bic("ESSESESS12") == 0, "validator accepted a 10 character BIC");
    TEST_ASSERT(validate_bic("ESSESESS1234") == 0, "validator accepted a 12 character BIC");
    TEST_ASSERT(validate_bic(tooLong) == 0, "validator accepted a 44 character BIC");
    return 0;
}

int test_bic_country_code() {
    TEST_ASSERT(validate_bic("ESSE1ESS") == 0, "validator accepted a digit as the first country code character");
    TEST_ASSERT(validate_bic("ESSES1SS") == 0, "validator accepted a digit as the second country code character");
    TEST_ASSERT(validate_bic("DEUT12FF500") == 0, "validator accepted a country code of digits in a BIC with a branch code");
    return 0;
}

int test_bic_invalid_characters() {
    const char* bics[] = { BIC_SHORT, BIC_LONG };
    const char badChars[] = { '-', 'a', ' ', '.', '\t', '\xC3' };
    char buf[32];
    TEST_ASSERT(validate_bic("essesess") == 0, "validator accepted a lowercase BIC");
    TEST_ASSERT(validate_bic("deutdeff500") == 0, "validator accepted a lowercase BIC with a branch code");
    TEST_ASSERT(validate_bic(" ESSESESS") == 0, "validator accepted a BIC with a leading space");
    for(int b = 0; b < 2; b++) {
        int len = (int)strlen(bics[b]);
        for(int c = 0; c < (int)sizeof(badChars); c++) {
            for(int i = 0; i < len; i++) {
                replace_char(bics[b], i, badChars[c], buf);
                TEST_ASSERT(validate_bic(buf) == 0, "validator accepted an invalid character at index %d in '%s'", i, buf);
            }
        }
    }
    return 0;
}

int test_bic_digits() {
    const char* bics[] = { BIC_SHORT, BIC_LONG };
    char buf[32];
    // Digits are fine everywhere except in the country code
    for(int b = 0; b < 2; b++) {
        int len = (int)strlen(bics[b]);
        for(int i = 0; i < len; i++) {
            replace_char(bics[b], i, '5', buf);
            int expected = (i == 4 || i == 5) ? 0 : 1;
            TEST_ASSERT(validate_bic(buf) == expected, "'%s' should return %d for validate_bic", buf, expected);
        }
    }
    return 0;
}

int test_bic_null() {
    TEST_ASSERT(validate_bic(NULL) == 0, "validator accepted a NULL BIC");
    return 0;
}

int main() {
    printf("Running libiban tests...\n");

    RUN_TEST(test_valid_iban);
    RUN_TEST(test_registry_table_matches_examples);
    RUN_TEST(test_registry_examples_valid);
    RUN_TEST(test_checksum_error);
    RUN_TEST(test_single_digit_errors);
    RUN_TEST(test_letters_in_bban);
    RUN_TEST(test_invalid_length);
    RUN_TEST(test_unknown_country);
    RUN_TEST(test_invalid_characters);
    RUN_TEST(test_spaced_iban_errors);
    RUN_TEST(test_error_precedence);
    RUN_TEST(test_null_error_out);
    RUN_TEST(test_mod97);
    RUN_TEST(test_valid_bic);
    RUN_TEST(test_bic_invalid_length);
    RUN_TEST(test_bic_country_code);
    RUN_TEST(test_bic_invalid_characters);
    RUN_TEST(test_bic_digits);
    RUN_TEST(test_bic_null);

    if(tests_failed > 0)
        return 1;

    return 0;
}
