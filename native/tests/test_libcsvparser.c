#include <stdio.h>
#include <stdbool.h>

#include "csv_parser.h"
#define CSV_HEADER "from_account_id,to_iban,amount,reference"

#include "test_macros.h"

int test_basic_row() {
    const char testData[] = CSV_HEADER "\r\n1,SE8550000000054910000003,5000.00,Faktura #2001";
    int row_count = 0;
    CsvRow* row = parse_csv(testData, sizeof(testData)-1, &row_count);
    TEST_ASSERT(row != NULL, "parser failed to load the test data");
    TEST_ASSERT(row_count == 1, "parser returned an incorrect row count");
    TEST_ASSERT(row->from_account_id == 1, "parser returned an incorrect account ID");
    TEST_ASSERT(strcmp(row->to_iban, "SE8550000000054910000003") == 0, "parser returned an incorrect IBAN");
    TEST_ASSERT(row->amount == 5000.00, "parser returned an incorrect payment amount");
    TEST_ASSERT(strcmp(row->reference, "Faktura #2001") == 0, "parser returned an incorrect reference");
    free_csv_rows(row);
    return 0;
}

int test_mixed_newlines() {
    const char testData[] = CSV_HEADER "\r\n1,SE8550000000054910000003,5000.00,Faktura #2001\n1,SE8550000000054910000003,5000.00,Faktura #2001\r1,SE8550000000054910000003,5000.00,Faktura #2001";
    int row_count = 0;
    CsvRow* rows = parse_csv(testData, sizeof(testData)-1, &row_count);
    TEST_ASSERT(rows != NULL, "parser failed to load the test data");
    TEST_ASSERT(row_count == 3, "parser returned an incorrect row count");
    for(int i = 0; i < 3; i++) {
        CsvRow* row = rows + i;
        TEST_ASSERT(row->from_account_id == 1, "row %d: parser returned an incorrect account ID", i+1);
        TEST_ASSERT(strcmp(row->to_iban, "SE8550000000054910000003") == 0, "row %d: parser returned an incorrect IBAN", i+1);
        TEST_ASSERT(row->amount == 5000.00, "row %d: parser returned an incorrect payment amount", i+1);
        TEST_ASSERT(strcmp(row->reference, "Faktura #2001") == 0, "row %d: parser returned an incorrect reference", i+1);
    }
    free_csv_rows(rows);
    return 0;
}

int test_empty_strings() {
    const char testData1[] = CSV_HEADER "\r\n1,,5000.00,Faktura #2001";
    const char testData2[] = CSV_HEADER "\r\n1,SE8550000000054910000003,5000.00,";
    int row_count = 0;
    CsvRow* rows = parse_csv(testData1, sizeof(testData1)-1, &row_count);
    TEST_ASSERT(rows != NULL, "parser failed when to_iban was empty");
    TEST_ASSERT(row_count == 1, "parser returned an incorrect row count on testData1");
    free_csv_rows(rows);
    rows = parse_csv(testData2, sizeof(testData2)-1, &row_count);
    TEST_ASSERT(rows != NULL, "parser failed when reference was empty");
    TEST_ASSERT(row_count == 1, "parser returned an incorrect row count on testData2");
    free_csv_rows(rows);
    return 0;
}

int test_empty_data() {
    const char testData1[] = "";
    const char testData2[] = CSV_HEADER;
    const char testData3[] = CSV_HEADER "\r\n";
    const char testData4[] = CSV_HEADER "\r\n\r\n";
    int row_count = 0;
    CsvRow* rows = parse_csv(testData1, sizeof(testData1)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser unexpectedly succeeded on testData1");
    rows = parse_csv(testData2, sizeof(testData2)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser unexpectedly succeeded on testData2");
    rows = parse_csv(testData3, sizeof(testData3)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser unexpectedly succeeded on testData3");
    rows = parse_csv(testData4, sizeof(testData4)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser unexpectedly succeeded on testData4");
    return 0;
}

int test_rfc4180_quotes() {
    const char testData1[] = CSV_HEADER "\r\n1,\"SE855\"\"'',,005491\r\r\n\n003\",5000.00,Faktura #2001";
    int row_count = 0;
    CsvRow* rows = parse_csv(testData1, sizeof(testData1)-1, &row_count);
    TEST_ASSERT(rows != NULL, "parser failed to load the test data");
    TEST_ASSERT(row_count == 1, "parser returned an incorrect row count");
    TEST_ASSERT(strcmp(rows->to_iban, "SE855\"'',,005491\r\r\n\n003") == 0, "parser returned an incorrect IBAN");
    return 0;
}

int test_invalid_values() {
    const char testData1[] = CSV_HEADER "\r\n1234A6789,SE8550000000054910000003,5000.00,Faktura #2001";
    const char testData2[] = CSV_HEADER "\r\n1,00000000000000000000000000000000000,5000.00,Faktura #2001";
    const char testData3[] = CSV_HEADER "\r\n1,SE8550000000054910000003,12345a,Faktura #2001";
    const char testData4[] = CSV_HEADER "\r\n1,S,5000.00,abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvw";
    int row_count = 0;
    CsvRow* rows;
    rows = parse_csv(testData1, sizeof(testData1)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser wrongfully accepted a non-numeric account ID");
    rows = parse_csv(testData2, sizeof(testData2)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser wrongfully accepted an IBAN too large");
    rows = parse_csv(testData3, sizeof(testData3)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser wrongfully accepted a non-numeric payment amount");
    rows = parse_csv(testData4, sizeof(testData4)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser wrongfully accepted a reference too large");
    return 0;
}

// from this point on I got an AI to help come up with test ideas

int test_multiple_different_rows() {
    const char testData[] = CSV_HEADER "\r\n" "1,SE8550000000054910000003,5000.00,Faktura #2001\n" "42,SE1234567890123456789012345,123.45,Test payment\n" "999999,SE9876543210987654321098765,0.01,Another payment";

    int row_count = 0;
    CsvRow* rows = parse_csv(testData, sizeof(testData)-1, &row_count);

    TEST_ASSERT(rows != NULL, "parser failed to load multiple rows");
    TEST_ASSERT(row_count == 3, "parser returned an incorrect row count");

    TEST_ASSERT(rows[0].from_account_id == 1, "row 1 has incorrect account ID");
    TEST_ASSERT(rows[1].from_account_id == 42, "row 2 has incorrect account ID");
    TEST_ASSERT(rows[2].from_account_id == 999999, "row 3 has incorrect account ID");

    TEST_ASSERT(rows[1].amount == 123.45, "row 2 has incorrect amount");
    TEST_ASSERT(strcmp(rows[2].reference, "Another payment") == 0, "row 3 has incorrect reference");

    free_csv_rows(rows);
    return 0;
}

int test_invalid_column_count() {
    const char testData1[] = CSV_HEADER "\r\n1,SE8550000000054910000003,5000.00";
    const char testData2[] = CSV_HEADER "\r\n1,SE8550000000054910000003,5000.00,Faktura #2001,extra";

    int row_count = 0;
    CsvRow* rows;

    rows = parse_csv(testData1, sizeof(testData1)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser accepted a row with a missing field");

    rows = parse_csv(testData2, sizeof(testData2)-1, &row_count);
    TEST_ASSERT(rows == NULL, "parser accepted a row with an extra field");

    return 0;
}

int main() {
    printf("Running libcsvparser tests...\n");

    RUN_TEST(test_basic_row);
    RUN_TEST(test_mixed_newlines);
    RUN_TEST(test_empty_strings);
    RUN_TEST(test_empty_data);
    RUN_TEST(test_rfc4180_quotes);
    RUN_TEST(test_invalid_values);
    RUN_TEST(test_multiple_different_rows);
    RUN_TEST(test_invalid_column_count);

    if(tests_failed > 0)
        return 1;

    return 0;
}