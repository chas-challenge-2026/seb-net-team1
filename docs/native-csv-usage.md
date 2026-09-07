# libcsvparser Usage Guide
Instructions for the Backend team on how to use libcsvparser in C# code.

> [!WARNING]
> Unsafe code has to be allowed in the project, to properly interface with heap memory.

## CSV Format
The parser is built around the expected format by the SEB website:
```
from_account_id,to_iban,amount,reference
1,SE8550000000054910000003,5000.00,Faktura #2001
1,SE8550000000054910000005,12500.00,Faktura #2002
```
Below are some important conventions to note:
- The header of 4 properties must exist and match the example
- Each data row must contain the 4 expected fields in order, no more and no less
- Empty string fields are valid
- Account ID cannot exceed 999,999,999 or be negative
- IBAN cannot exceed 34 characters
- Reference cannot exceed 100 characters
- Amount must be a valid number

## Library Location
libcsvparser is integrated into the Docker build process and you may have to run `docker compose up --build` before the binary appears.

From the project root, the build will exist as `native/libcsvparser.so`

## Functions
The native CSV parser allows the following function imports, translated to C#
```
public static class CsvParser
{
    [DllImport("native/libcsvparser.so", CallingConvention = CallingConvention.Cdecl)]
    public static extern CsvResult parse_csv(byte[] content, int content_len);
    
    [DllImport("native/libcsvparser.so", CallingConvention = CallingConvention.Cdecl)]
    public static extern void free_csv_rows(CsvRow* rows);
}
```

## Data Types
These are the following structs defined by libcsvparser, translated to C#
```
[StructLayout(LayoutKind.Sequential)]
public unsafe struct CsvRow {
    public int from_account_id;
    public fixed byte to_iban[35];
    public double amount;
    public fixed byte reference[101];
}

[StructLayout(LayoutKind.Sequential)]
public unsafe struct CsvResult {
    [MarshalAs(UnmanagedType.I1)]
    public bool valid;
    public fixed byte error[256];
    public int row_count;
    public CsvRow* rows;
}
```

> [!WARNING]
> The `CsvResult` given by **parse_csv** will contain a null pointer for the `rows` parameter if parsing failed.<br>
> Never dereference `rows` unless `valid` is true and `rows` is not null. Dereferencing a null pointer will crash the program.

### Memory ownership
When a successful (valid) `CsvResult` is received, libcsvparser allocates memory pointed to by `rows` and it should be freed by the C# code through `free_csv_rows`.<br>
Upon freeing memory through `free_csv_rows`, do not attempt to interact with that data again or you risk crashing the program.

### CsvResult variants
When `valid` is `true`, the `rows` property contains heap memory with `row_count` amount of row data.<br>
When `valid` is `false`, the `rows` property is `null` and the parser outputs an error string to the `error` property.


## Usage
Below is an example of safely parsing a CSV file with the library.<br>

> [!WARNING]
> Make sure to call `free_csv_rows` when you are done processing the CSV rows.<br>
> If you don't, the native memory allocated by libcsvparser will leak.<br><br>
> It is recommended to use a try-finally block when processing the rows,<br>
> so that `free_csv_rows` is still called if an exception occurs while processing the CSV data.

> [!NOTE]
> Strings like `to_iban`, `reference` and `error` cannot be printed directly.<br>
> Proper conversion for these types can be seen in the example, and requires an unsafe context.

```
byte[] csv = File.ReadAllBytes("payments.csv"); // example source
CsvResult parsedCsv = parse_csv(csv, csv.Length);
if(parsedCsv.valid) {
    // Parsing successful
    unsafe
    {
        for(int i = 0; i < parsedCsv.row_count; i++)
        {
            CsvRow* row = &parsedCsv.rows[i];

            string iban = Encoding.UTF8.GetString(row->to_iban, 35).TrimEnd('\0');
            string reference = Encoding.UTF8.GetString(row->reference, 101).TrimEnd('\0');

            Console.WriteLine($"Account: {row->from_account_id}");
            Console.WriteLine($"To IBAN: {iban}");
            Console.WriteLine($"Amount: {row->amount}");
            Console.WriteLine($"Reference: {reference}");
        }
        free_csv_rows(parsedCsv.rows);
    }
} else {
    unsafe
    {
        string error = Encoding.UTF8.GetString(parsedCsv.error, 256).TrimEnd('\0');
        Console.WriteLine($"Parsing failed: {error}");
    }
}
```