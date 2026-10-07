#pragma once

// Returns 1 if the IBAN is valid (format + MOD97), otherwise 0. Spaces in the IBAN are ignored.
// error_out may be NULL. If 0 is returned it is set to the error code:
// 1 = too short/long, 2 = invalid country code, 3 = invalid character, 4 = MOD97 failure
int validate_iban(const char* iban, int* error_out);

// Returns the MOD97 remainder of the IBAN, 1 means the check digits are correct.
// Expects an IBAN that has already passed the character check.
int iban_mod97(const char* iban);

// Returns 1 if the BIC is valid (ISO 9362 format), otherwise 0.
// A BIC is 8 or 11 upper case characters (no spaces), the country code (characters 5 and 6) must be letters.
int validate_bic(const char* bic);

#define IBAN_API __attribute__((visibility("default")))