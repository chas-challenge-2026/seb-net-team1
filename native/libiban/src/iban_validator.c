#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include "iban_registry.h"

#define MIN_IBAN 14 // Smallest IBAN, but smallest country code is NO with 15.
#define MAX_IBAN 35 // Largest IBAN.

static int fail(int* error_out, int code) {
    if(error_out != NULL)
        *error_out = code;
    return 0;
}

static int mod97_feed(int rem, char c)
{
    if(c >= '0' && c <= '9')
        return (rem * 10 + (c - '0')) % 97;
    return (rem * 100 + (c - 'A' + 10)) % 97;
}

int iban_mod97(const char* iban)
{
    int rem = 0;
    int pos = 0;

    // BBAN first
    for(const char* p = iban; *p != '\0'; p++) {
        if(*p == ' ')
            continue;
        if(pos++ >= 4)
            rem = mod97_feed(rem, *p);
    }

    pos = 0;
    for(const char* p = iban; *p != '\0' && pos < 4; p++) {
        if(*p == ' ')
            continue;
        rem = mod97_feed(rem, *p);
        pos++;
    }

    return rem;
}

int validate_iban(const char* iban, int* error_out)
{
    // Extract length
    const char* search = iban;
    int whitespaces = 0;
    while(*search != '\0') {
        if(search-whitespaces == iban + MAX_IBAN) // Maximum IBAN length
            return fail(error_out, 1); // IBAN too long
        if(*search == ' ')
            whitespaces++;
        search++;
    }
    int iban_len = search - iban - whitespaces;
    if(iban_len < MIN_IBAN)
        return fail(error_out, 1); // IBAN too short

    // Locate country & expected length
    char countryCode[3];
    memcpy(countryCode, iban, 2);
    countryCode[2] = '\0';
    bool valid = false;
    for(size_t i = 0; i < IBAN_COUNTRY_COUNT; i++) {
        IbanCountryLen country = countries[i];
        if(strcmp(countryCode, country.code) == 0) {
            valid = true;
            if(iban_len != country.expected_length)
                return fail(error_out, 1); // Invalid length for country code
        }
    }
    if(!valid)
        return fail(error_out, 2);  // Invalid country code
    
    // Validate characters, 2-3 are digits only, rest is A-Z and 0-9
    int counted_spaces = 0;
    for(int i = 2; i < iban_len+counted_spaces; i++) {
        char symbol = iban[i];
        if(symbol == ' ') { // Skip over spaces
            counted_spaces++;
            continue;
        }
        if(symbol >= '0' && symbol <= '9') // 0-9 check
            continue;
        if(symbol >= 'A' && symbol <= 'Z') {
            if(i - counted_spaces >= 4) // A-Z fails if in positions 2-3
                continue;
        }
        return fail(error_out, 3);
    }

    // Calculate MOD97
    if(iban_mod97(iban) != 1)
        return fail(error_out, 4);

    return 1;
}