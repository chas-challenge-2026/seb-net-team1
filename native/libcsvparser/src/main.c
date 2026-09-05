// This environment only exists in DEBUG builds to test the csv parser.

#ifdef DEBUG
    #include <stdio.h>
    #include <string.h>

    #include "csv_parser.h"

    const char* mockData = "from_account_id,to_iban,amount,reference\r\n1,SE8550000000054910000003,5000.00,Faktura #2001\r\n1,SE8550000000054910000005,12500.00,Faktura #2002";

    int main() {
        printf("=== libcsvparser Tester ===\n\n");
        printf("Invoking parser with mock data...\n");

        int rows = 0;
        parse_csv(mockData, strlen(mockData), &rows);

        return 0;
    }
#endif