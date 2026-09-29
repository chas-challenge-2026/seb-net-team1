namespace SebPortal.Api.Models;

/// <summary>
/// Key/value settings the application generates itself, e.g. a fallback audit
/// signing key when none is configured.
/// </summary>
public class SystemSetting
{
    public string Key { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}
