// Main libcsvparser exports, handles initial data of a CSV file validating the header, detecting CRLF then dispatching either the singlethread or multithread parser variants.

#include <string.h>
#include <stdlib.h>
#include <stdbool.h>

#include "parse.h"
#include "csv_parser.h"

static inline CsvResult generateError(const char* error) {
    CsvResult result = {0};
    strcpy(result.error, error);
    return result;
}

CSV_API CsvResult parse_csv(const char* content, int content_len) {
    bool containsCRLF = false;

    // Trim out header and locate CRLF
    const char* headerEnd = NULL;
    for (const char* p = content; p < content + content_len; p++) {
        if (*p == '\n' || *p == '\r') {
            headerEnd = p;
            break;
        }
    }
    if(!headerEnd)
        return generateError("No newline found so header never ended.");
    const char* contentBegin = headerEnd + 1;
    if (*headerEnd == '\r') {
        if (headerEnd + 1 < content + content_len && *(headerEnd + 1) == '\n') {
            containsCRLF = true;
            contentBegin = headerEnd + 2; // skip \r\n
        } else {
            contentBegin = headerEnd + 1; // bare \r
        }
    } else {
        contentBegin = headerEnd + 1; // bare \n
    }

    int header_size = headerEnd - content;
    if(header_size != strlen(REQUIRED_HEADER) || strncmp(REQUIRED_HEADER, content, header_size) != 0)
        return generateError("Header does not match expected format.");
    //dprintf("File contains CRLF: %s\n", (containsCRLF) ? "true" : "false");

    int trueDataSize = content_len - (contentBegin - content);
    bool use_multithread = (trueDataSize > SINGLETHREAD_THRESHOLD);

    //dprintf("True data size: %i\n", trueDataSize);

    //dprintf("Invoking single-threaded parser path...\n");
    return parse_csv_single(contentBegin, trueDataSize);

    // Implement this code when multithread path is complete.

    //dprintf("Invoking %s parser path...\n", use_multithread ? "multi-threaded" : "single-threaded");
    //return (use_multithread ? parse_csv_multi : parse_csv_single)(contentBegin, trueDataSize, rows_out, containsCRLF);
}

CSV_API void free_csv_rows(CsvRow* rows) {
    if(rows == NULL)
        return;
    free(rows);
}