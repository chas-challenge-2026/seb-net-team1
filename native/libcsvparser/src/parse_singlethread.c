#include <errno.h>
#include <stdlib.h>
#include <string.h>

#include "parse.h"
#include "helpers.h"

/*
  Single-threaded parser path for small CSV files
  Unlike the multithreaded path, this path uses a growing heap allocation to avoid sweeping the file twice ensuring maximum parse speed.
*/

CsvRow* parse_csv_single(const char* content, int content_len, int* rows_out) {
    CsvRow* rows = malloc(sizeof(CsvRow) * 2); // TODO: Change to dynamic allocation

    CsvRow* currentRow = rows;
    const char* dataEnd = content + content_len;

    const char* readHead = content;
    int fieldIndex = 0;
    int validRows = 0;
    while(1) {
        if (readHead >= dataEnd) break;

        char fieldData[FIELD_MAX_LEN];
        char* writeHead = fieldData;
        char* fieldDataEnd = fieldData + FIELD_MAX_LEN - 1;
        bool isQuotedField = *readHead == '\"';
        bool quoteClosed = false;
        bool rowEnded = false;

        if(isQuotedField)
            readHead++;

        while(readHead < dataEnd) {
            char byte = *readHead++;
            if(isQuotedField) {
                if(byte == '\"') {
                    char byte2 = (readHead < dataEnd) ? *readHead++ : '\n';
                    if(byte2 == '\"') {
                        if (writeHead >= fieldDataEnd) goto malformed;
                        *writeHead++ = '\"';
                    } else if(byte2 == ',') {
                        quoteClosed = true;
                        break;
                    } else if(byte2 == '\r' || byte2 == '\n') {
                        if(byte2 == '\r' && readHead < dataEnd && *readHead == '\n')
                            readHead++;
                        rowEnded = true;
                        quoteClosed = true;
                        break;
                    } else {
                        goto malformed;
                    }
                } else {
                    if (writeHead >= fieldDataEnd) goto malformed;
                    *writeHead++ = byte;
                }
            } else {
                if(byte == ',') {
                    break;
                } else if(byte == '\r') {
                    if(readHead < dataEnd && *readHead == '\n') readHead++;
                    rowEnded = true;
                    break;
                } else if(byte == '\n') {
                    rowEnded = true;
                    break;
                } else if(byte == '\"') {
                    goto malformed; // Bottom of function.
                } else {
                    if (writeHead >= fieldDataEnd) goto malformed;
                    *writeHead++ = byte;
                }
            }
        }
        if (isQuotedField && !quoteClosed) goto malformed;
        *writeHead = '\0';

        int fieldLength = writeHead-fieldData;

        switch(fieldIndex) {
            case CSVValue_AccountID:
                if(fieldLength > 9)
                    goto malformed;
                for(char* pos = fieldData; pos < fieldData+fieldLength; pos++) {
                    char byte = *pos;
                    if(byte < 0x30 || byte > 0x39) // Is the byte outside the ASCII number range?
                        goto malformed;
                }
                currentRow->from_account_id = atoi(fieldData);
                break;
            case CSVValue_ToIBAN:
                if(fieldLength > 34)
                    goto malformed;
                strcpy(currentRow->to_iban, fieldData);
                break;
            case CSVValue_Amount:
            {
                errno = 0;
                char *endptr;
                double value = strtod(fieldData, &endptr);
                bool success = endptr != fieldData && *endptr == '\0' && errno != ERANGE;
                if(!success)
                    goto malformed;
                currentRow->amount = value;
                break;
            }
            case CSVValue_Reference:
                if(fieldLength > 100)
                    goto malformed;
                strcpy(currentRow->reference, fieldData);
                break;
        }

        if(rowEnded || readHead >= dataEnd) {
            if(fieldIndex != 3)
                goto malformed;
            fieldIndex = 0;
            validRows++;
            currentRow++;
        } else {
            fieldIndex++;
        }
    }

#ifdef DEBUG
    dprintf("Processed %i CSV rows.\n", validRows);

    for(int i = 0; i < validRows; i++) {
        CsvRow* row = rows + i;
        dprintf("\n=== Row %i ===\n", i);
        dprintf("From account %i to IBAN: %s\n", row->from_account_id, row->to_iban);
        dprintf("Amount: %lf\n", row->amount);
        dprintf("Reference: %s\n", row->reference);
    }
#endif

    *rows_out = validRows;
    return rows;

    malformed:
    free(rows);
    return NULL;
}