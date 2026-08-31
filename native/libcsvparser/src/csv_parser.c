#include <stdlib.h>

#include "csv_parser.h"

CsvRow* parse_csv(const char* content, int content_len, int* rows_out) {
    // TODO
}

void free_csv_rows(CsvRow* rows) {
    free(rows);
}