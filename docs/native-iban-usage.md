# libiban Usage Guide
Instructions for the Backend team on how to use libiban in C# code.

## Library Location
libiban is integrated into the Docker build process and you may have to run `docker compose up --build` before the binary appears.

From the project root, the build will exist as `native/libiban.so`

## Functions
The native IBAN/BIC-validator allows the following function imports, translated to C#
```
public static class IbanValidator
{
    [DllImport("native/libiban.so", CallingConvention = CallingConvention.Cdecl)]
    public static extern int iban_mod97([MarshalAs(UnmanagedType.LPUTF8Str)] string iban);

    [DllImport("native/libiban.so", CallingConvention = CallingConvention.Cdecl)]
    public static extern int validate_iban([MarshalAs(UnmanagedType.LPUTF8Str)] string iban, out int errorOut);

    [DllImport("native/libiban.so", CallingConvention = CallingConvention.Cdecl)]
    public static extern int validate_bic([MarshalAs(UnmanagedType.LPUTF8Str)] string bic);
}
```

### iban_mod97
Returns the MOD97 remainder of an input IBAN value, where 1 is valid.

Returns -1 if no IBAN is provided.

### validate_iban
Validates an input IBAN against country code lengths, character sections and MOD97. Returns 1 on success and 0 on failure, and writes the failure reason to errorOut.

Failure reasons (errorOut):
- 0: No IBAN was received from the caller.
- 1: IBAN length does not match expected country size.
- 2: Unrecognized country code.
- 3: IBAN contained invalid characters, cannot contain A-Z in positions 2-3.
- 4: IBAN failed MOD97 validation.

### validate_bic
Validates the structure of a BIC (ISO 9362). Returns 1 on success and 0 on failure. There is no error code, so only the return value is checked.

A valid BIC is:
- 8 or 11 characters long. The optional 3-character branch code makes it 11.
- Uppercase letters and digits only. Lowercase letters and spaces are rejected, so normalize input before calling.
- Characters 1-4 (bank code) and 7-8 (location) may be letters or digits.
- Characters 5-6 (country code) must be letters.

This is a format check only. It does not check that the bank or country exists, and it does not apply the stricter location and branch rules some libraries enforce.