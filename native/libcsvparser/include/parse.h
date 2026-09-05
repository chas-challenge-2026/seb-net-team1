#pragma once

#include <stdbool.h>

#include "csv_parser.h"

CsvRow* parse_csv_single(const char* content, int content_len, int* rows_out);
CsvRow* parse_csv_multi(const char* content, int content_len, int* rows_out);