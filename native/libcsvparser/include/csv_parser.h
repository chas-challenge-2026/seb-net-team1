#pragma once

/*
  Changing the required header won't change parser behavior, it is optimally designed to parse fields in this order.
  A field list change requires a rewrite of the "parse" C files.
*/
#define REQUIRED_HEADER "from_account_id,to_iban,amount,reference"

// Required content length to switch to multithreaded parser. | TODO: Benchmark paths (multithread should be 4 core) to determine proper eligible switching point.
#define SINGLETHREAD_THRESHOLD 131072

// Max field length allowed in the CSV data.
#define FIELD_MAX_LEN 100

// How many rows the single-threaded parser allocates in advance, adjusted for best performance, do not modify.
#define DEFAULT_ALLOC_SIZE 64

#define CSV_API __attribute__((visibility("default")))

enum CSVValue {
    CSVValue_AccountID = 0,
    CSVValue_ToIBAN = 1,
    CSVValue_Amount = 2,
    CSVValue_Reference = 3
};

/*
  CsvRow was modified to exclude valid and error, including this information per-row wastes memory as we should never return a partially processed batch payment file.
  The excluded values are now part of another struct where memory is not cloned.
  Allocating memory for 50,000 rows with this new model takes 7.6MB as opposed to 20.8MB.
*/
typedef struct {
    int from_account_id;
    char to_iban[35];
    double amount;
    char reference[101];
} CsvRow;

typedef struct {
    int valid;
    char error[256];
    int row_count;
    CsvRow* rows;
} CsvResult;

CsvRow* parse_csv(const char* content, int content_len, int* rows_out);

void free_csv_rows(CsvRow* rows);