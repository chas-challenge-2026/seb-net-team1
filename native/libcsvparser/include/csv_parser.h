#pragma once

typedef struct {
    int from_account_id;
    char to_iban[35];
    double amount;
    char reference[101];
    int valid;         // 1 = ok, 0 = parsningsfel
    char error[256];    // felmeddelande om valid == 0
} CsvRow;

CsvRow* parse_csv(const char* content, int content_len, int* rows_out);

void free_csv_rows(CsvRow* rows);