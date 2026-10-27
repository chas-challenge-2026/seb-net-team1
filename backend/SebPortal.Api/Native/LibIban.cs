using System.Reflection;
using System.Runtime.InteropServices;
using SebPortal.Api.Validation;

namespace SebPortal.Api.Native;

/// <summary>
/// P/Invoke bindings for native/libiban (validate_iban, validate_bic). The shared
/// library is built into the Docker image next to the API assembly. When it cannot
/// be loaded (for example on a Windows developer machine) <see cref="IsAvailable"/>
/// is false and <see cref="IbanValidator"/> uses its managed implementation instead.
/// </summary>
internal static class LibIban
{
    private const string LibraryName = "libiban";

    private static readonly Lazy<bool> Available = new(() => NativeLibraryProbe.CanLoad(LibraryName, "validate_iban", "validate_bic"));

    public static bool IsAvailable => Available.Value;

    public static IbanErrorCode Validate(string normalizedIban)
    {
        var errorCode = 0;
        var valid = validate_iban(normalizedIban, ref errorCode);

        if (valid == 1)
        {
            return IbanErrorCode.None;
        }

        return Enum.IsDefined(typeof(IbanErrorCode), errorCode) && errorCode != 0
            ? (IbanErrorCode)errorCode
            : IbanErrorCode.InvalidChecksum;
    }

    public static bool ValidateBic(string bic) => validate_bic(bic) == 1;

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int validate_iban([MarshalAs(UnmanagedType.LPUTF8Str)] string iban, ref int errorOut);

    [DllImport(LibraryName, CallingConvention = CallingConvention.Cdecl)]
    private static extern int validate_bic([MarshalAs(UnmanagedType.LPUTF8Str)] string bic);
}

internal static class NativeLibraryProbe
{
    /// <summary>
    /// True when the library loads from the application directory and exports every
    /// named function. Never throws: a missing library just means "use the fallback".
    /// </summary>
    public static bool CanLoad(string libraryName, params string[] exports)
    {
        try
        {
            if (!NativeLibrary.TryLoad(libraryName, Assembly.GetExecutingAssembly(), DllImportSearchPath.AssemblyDirectory, out var handle))
            {
                return false;
            }

            return exports.All(export => NativeLibrary.TryGetExport(handle, export, out _));
        }
        catch (Exception)
        {
            return false;
        }
    }
}
