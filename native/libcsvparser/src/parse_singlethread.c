#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "parse.h"

/*
  Single-threaded parser path for small CSV files
  Unlike the multithreaded path, this path uses a growing heap allocation to avoid sweeping the file twice ensuring maximum parse speed.
*/

typedef struct {
    int count;
    int capacity;
    CsvRow* buffer;
} DynamicCsvRow;

DynamicCsvRow* DynCSV_Init() {
    DynamicCsvRow* dyncsv = malloc(sizeof(DynamicCsvRow));  
    if(!dyncsv) return NULL;
    dyncsv->capacity = DEFAULT_ALLOC_SIZE;
    dyncsv->count = 0;
    dyncsv->buffer = malloc(sizeof(CsvRow) * dyncsv->capacity);
    if(!dyncsv->buffer) {
        free(dyncsv);
        return NULL;
    }
    return dyncsv;
}

bool DynCSV_Increment(DynamicCsvRow* dyncsv) {
    dyncsv->count++;
    if(dyncsv->count >= dyncsv->capacity) {
        dyncsv->capacity *= 2;
        dyncsv->buffer = realloc(dyncsv->buffer, sizeof(CsvRow) * dyncsv->capacity);
        if(!dyncsv->buffer)
            return false;
    }
    return true;
}

void DynCSV_Trim(DynamicCsvRow* dyncsv) {
    if(dyncsv->count < dyncsv->capacity) {
        CsvRow* smallerBuf = realloc(dyncsv->buffer, sizeof(CsvRow) * dyncsv->count);
        if(smallerBuf != NULL) {
            dyncsv->buffer = smallerBuf;
            dyncsv->capacity = dyncsv->count;
        }
    }
}

static inline CsvResult generateError(const char* error) {
    if(error == NULL)
        error = "Unknown error";
    CsvResult result = {0};
    strcpy(result.error, error);
    return result;
}

CsvResult parse_csv_single(const char* content, int content_len) {
    DynamicCsvRow* dyncsv = DynCSV_Init();
    if(dyncsv == NULL) return generateError("Internal server error, out of memory");

    const char* dataEnd = content + content_len;
    const char* outError = NULL;
    const char* readHead = content;
    int fieldIndex = 0;
    int validRows = 0;
    while(1) {
        if (readHead >= dataEnd && fieldIndex == 0) break;

        char fieldData[FIELD_MAX_LEN];
        char* writeHead = fieldData;
        char* fieldDataEnd = fieldData + FIELD_MAX_LEN;
        bool isQuotedField = *readHead == '\"';
        bool quoteClosed = false;
        bool rowEnded = false;
        bool fieldEnded = false;

        if(isQuotedField)
            readHead++;

        while(readHead < dataEnd) {
            char byte = *readHead++;
            if(isQuotedField) {
                if(byte == '\"') {
                    char byte2 = (readHead < dataEnd) ? *readHead++ : '\n';
                    if(byte2 == '\"') {
                        if (writeHead >= fieldDataEnd) { outError = "CSV contained a quoted field too long"; goto malformed; }
                        *writeHead++ = '\"';
                    } else if(byte2 == ',') {
                        quoteClosed = true;
                        fieldEnded = true;
                        break;
                    } else if(byte2 == '\r' || byte2 == '\n') {
                        if(byte2 == '\r' && readHead < dataEnd && *readHead == '\n')
                            readHead++;
                        rowEnded = true;
                        quoteClosed = true;
                        break;
                    } else {
                        outError = "CSV is malformed, contains data after end of quoted field";
                        goto malformed;
                    }
                } else {
                    if (writeHead >= fieldDataEnd) { outError = "CSV contained a quoted field too long"; goto malformed; }
                    *writeHead++ = byte;
                }
            } else {
                if(byte == ',') {
                    fieldEnded = true;
                    break;
                } else if(byte == '\r') {
                    if(readHead < dataEnd && *readHead == '\n') readHead++;
                    rowEnded = true;
                    break;
                } else if(byte == '\n') {
                    rowEnded = true;
                    break;
                } else if(byte == '\"') {
                    outError = "CSV is malformed, contains a quote in an unquoted field";
                    goto malformed; // Bottom of function.
                } else {
                    if (writeHead >= fieldDataEnd) { outError = "CSV contained a quoted field too long"; goto malformed; }
                    *writeHead++ = byte;
                }
            }
        }
        if (isQuotedField && !quoteClosed) { outError = "CSV is malformed, missing end quote on quoted field"; goto malformed; }
        *writeHead = '\0';

        int fieldLength = writeHead-fieldData;

        CsvRow* currentRow = dyncsv->buffer + validRows;
        switch(fieldIndex) {
            case CSVValue_AccountID:
                if(fieldLength > 9) {
                    outError = "CSV is unsupported, found an account ID larger than 9 characters";
                    goto malformed;
                }
                for(char* pos = fieldData; pos < fieldData+fieldLength; pos++) {
                    char byte = *pos;
                    if(byte < 0x30 || byte > 0x39) { // Is the byte outside the ASCII number range?
                        outError = "CSV is malformed, found a non-numeric account ID";
                        goto malformed;
                    }
                }
                currentRow->from_account_id = atoi(fieldData);
                break;
            case CSVValue_ToIBAN:
                if(fieldLength > 34) {
                    outError = "CSV is unsupported, found an IBAN longer than 34 characters";
                    goto malformed;
                }
                strcpy(currentRow->to_iban, fieldData);
                break;
            case CSVValue_Amount:
            {
                errno = 0;
                char *endptr;
                double value = strtod(fieldData, &endptr);
                bool success = endptr != fieldData && *endptr == '\0' && errno != ERANGE;
                if(!success) {
                    outError = "CSV is malformed, failed to convert a payment amount";
                    goto malformed;
                }
                currentRow->amount = value;
                break;
            }
            case CSVValue_Reference:
                if(fieldLength > 100) {
                    outError = "CSV is unsupported, found a reference longer than 100 characters";
                    goto malformed;
                }
                strcpy(currentRow->reference, fieldData);
                break;
        }

        if(rowEnded || (readHead >= dataEnd && !fieldEnded)) {
            if(fieldIndex != 3) {
                outError = "CSV is malformed, a row doesn't contain the expected value count";
                goto malformed;
            }
            fieldIndex = 0;
            validRows++;
            currentRow++;
            if(!DynCSV_Increment(dyncsv)) {
                outError = "Internal server error, out of memory";
                goto malformed;
            }
        } else {
            fieldIndex++;
        }
    }

    if(validRows == 0) {
        if(dyncsv->buffer != NULL)
            free(dyncsv->buffer);
        free(dyncsv);
        return generateError("CSV contained no rows");
    }

    DynCSV_Trim(dyncsv);
    CsvRow* rows = dyncsv->buffer;
    free(dyncsv);

    CsvResult result = {.valid = 1, .rows = rows, .row_count = validRows};
    memset(result.error, 0, 256);
    return result;

    malformed:
    if(dyncsv->buffer != NULL)
        free(dyncsv->buffer);
    free(dyncsv);
    return generateError(outError);
}