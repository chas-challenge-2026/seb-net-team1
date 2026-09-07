// This environment only exists in DEBUG builds to test the csv parser.

#ifdef _DEBUG
    #include <stdio.h>
    #include <stdlib.h>
    #include <string.h>
    #include <stdint.h>
    #include <stdbool.h>

    #include "helpers.h"
    #include "csv_parser.h"

    const char* mockHeader = "from_account_id,to_iban,amount,reference";
    const char* mockRow = "\r\n1,SE8550000000054910000003,5000.00,Faktura #2001";

    int main() {
        printf("=== libcsvparser Tester ===\n\n");
        printf("Generating mock data...\n");

        int row_count = 50000;

        int headerLen = strlen(mockHeader);
        int rowLen = strlen(mockRow);
        char* mockData = malloc(strlen(mockHeader) + strlen(mockRow) * row_count + 1);
        char* writeHead = mockData;
        memcpy(writeHead, mockHeader, headerLen);
        writeHead += headerLen;

        for(int i = 0; i < row_count; i++) {
            memcpy(writeHead, mockRow, rowLen);
            writeHead += rowLen;
        }
        *writeHead = '\0';

        printf("Invoking parser with mock data...\n");

        uint64_t begin = altutime();
        CsvRow* rows = parse_csv(mockData, writeHead-mockData, &row_count);
        uint64_t end = altutime();
        uint64_t us_spent = end-begin;

        if(!rows) {
            printf("Parser failed!\n");
            return 0;
        }

        printf("Parser completed in %lf ms. (rows=%i)\n", (double)us_spent / 1000.0, row_count);

        bool valid = true;
        for(int i = 0; i < row_count; i++) {
            CsvRow* row = rows + i;
            if(row->from_account_id != 1) { valid = false; break; }
            if(strcmp(row->to_iban, "SE8550000000054910000003") != 0) { valid = false; break; }
            if(row->amount != 5000.00) { valid = false; break; }
            if(strcmp(row->reference, "Faktura #2001") != 0) { valid = false; break; }
        }

        if(valid) {
            printf("The parser output is valid!\n");
        } else {
            printf("Parser output failed validation.\n");
        }

        return 0;
    }
#endif