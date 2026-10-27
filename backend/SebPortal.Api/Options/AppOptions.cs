namespace SebPortal.Api.Options;

/// <summary>
/// SMTP settings for e-mail notifications (section "Smtp"). Leave Host empty to
/// disable e-mail delivery; notifications are then still shown in the app and their
/// e-mail status is recorded as "skipped" instead of failing.
/// </summary>
public class SmtpOptions
{
    public const string SectionName = "Smtp";

    public string? Host { get; set; }
    public int Port { get; set; } = 25;

    /// <summary>"none", "starttls", "ssl" or "auto".</summary>
    public string Security { get; set; } = "auto";

    public string? Username { get; set; }
    public string? Password { get; set; }
    public string FromAddress { get; set; } = "noreply@seb-portal.local";
    public string FromName { get; set; } = "SEB Företagsbetalningar";

    /// <summary>Delivery attempts per e-mail before it is marked as failed.</summary>
    public int MaxAttempts { get; set; } = 3;

    /// <summary>Delay before the first retry; doubled for every following retry.</summary>
    public int RetryBaseDelayMilliseconds { get; set; } = 1000;

    public int TimeoutSeconds { get; set; } = 10;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host);
}

/// <summary>Settings for the audit log (section "Audit").</summary>
public class AuditOptions
{
    public const string SectionName = "Audit";

    /// <summary>
    /// HMAC key for the audit chain. Set it through the environment
    /// (Audit__SigningKey) in every deployed environment. When it is missing, a random
    /// key is generated once and stored in the database, which still detects edits
    /// made without application access but is weaker than a key kept outside the database.
    /// </summary>
    public string? SigningKey { get; set; }
}

/// <summary>Limits for CSV batch uploads (section "Batch"). Fixes BUG-012.</summary>
public class BatchOptions
{
    public const string SectionName = "Batch";

    public long MaxFileSizeBytes { get; set; } = 1024 * 1024;
    public int MaxRows { get; set; } = 1000;
}

/// <summary>General application settings (section "App").</summary>
public class AppOptions
{
    public const string SectionName = "App";

    /// <summary>Base URL of the portal, used for links in notification e-mails.</summary>
    public string PublicUrl { get; set; } = "http://localhost:3000";

    /// <summary>Apply pending EF Core migrations when the application starts.</summary>
    public bool MigrateOnStartup { get; set; } = true;

    /// <summary>Insert the Malmö Bygg AB demo tenant when the database is empty.</summary>
    public bool SeedDemoData { get; set; } = true;

    /// <summary>
    /// Drop a database created by v1's seed.sql (old tables, no migration history)
    /// and rebuild it with the migrations. Only acts on such a legacy database, so it
    /// is harmless to leave on afterwards, but it does delete that database's data.
    /// </summary>
    public bool ResetLegacyDatabase { get; set; }
}
