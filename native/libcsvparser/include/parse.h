#pragma once

#include <stdbool.h>

#include "csv_parser.h"

CsvResult parse_csv_single(const char* content, int content_len);
CsvResult parse_csv_multi(const char* content, int content_len);