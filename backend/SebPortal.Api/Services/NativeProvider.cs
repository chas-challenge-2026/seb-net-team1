using System.Runtime.InteropServices;

namespace SebPortal.Api.Services;

public class NativeProvider
{
    public class CSV
    {
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

        [DllImport("native/libcsvparser.so", CallingConvention = CallingConvention.Cdecl)]
        public static extern CsvResult parse_csv(byte[] content, int content_len);
        
        [DllImport("native/libcsvparser.so", CallingConvention = CallingConvention.Cdecl)]
        public static extern unsafe void free_csv_rows(CsvRow* rows);
    }

    public class IBAN
    {
        [DllImport("native/libiban.so", CallingConvention = CallingConvention.Cdecl)]
        public static extern int iban_mod97([MarshalAs(UnmanagedType.LPUTF8Str)] string iban);

        [DllImport("native/libiban.so", CallingConvention = CallingConvention.Cdecl)]
        public static extern int validate_iban([MarshalAs(UnmanagedType.LPUTF8Str)] string iban, out int errorOut);

        [DllImport("native/libiban.so", CallingConvention = CallingConvention.Cdecl)]
        public static extern int validate_bic([MarshalAs(UnmanagedType.LPUTF8Str)] string bic);
    }
}