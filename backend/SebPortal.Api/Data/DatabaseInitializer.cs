using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SebPortal.Api.Auditing;
using SebPortal.Api.Models;
using SebPortal.Api.Options;
using SebPortal.Api.Services;

namespace SebPortal.Api.Data;

/// <summary>
/// Runs once at startup: applies EF Core migrations, prepares the audit signing key
/// and seeds the demo tenant into an empty database.
/// </summary>
public static class DatabaseInitializer
{
    private const string AuditKeySetting = "audit_signing_key";
    private const string InMemoryAuditKey = "in-memory-test-audit-key-that-is-long-enough";

    public static async Task InitializeAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var provider = scope.ServiceProvider;
        var db = provider.GetRequiredService<SebDbContext>();
        var logger = provider.GetRequiredService<ILoggerFactory>().CreateLogger(typeof(DatabaseInitializer));
        var appOptions = provider.GetRequiredService<IOptions<AppOptions>>().Value;
        var keyProvider = provider.GetRequiredService<AuditSigningKeyProvider>();

        var relational = db.Database.IsRelational();

        if (relational && appOptions.MigrateOnStartup)
        {
            await EnsureNotLegacySchemaAsync(db, appOptions, logger, cancellationToken);
            await db.Database.MigrateAsync(cancellationToken);
            logger.LogInformation("Database schema is up to date");
        }

        if (!keyProvider.IsInitialized)
        {
            keyProvider.Initialize(await ResolveAuditKeyAsync(db, provider, relational, logger, cancellationToken));
        }

        if (relational && appOptions.SeedDemoData && !await db.Tenants.AnyAsync(cancellationToken))
        {
            var hasher = provider.GetRequiredService<PasswordHasher>();
            await DemoDataSeeder.SeedAsync(db, hasher, cancellationToken);
            logger.LogInformation("Seeded the Malmö Bygg AB demo tenant");
        }
    }

    /// <summary>
    /// Databases created by v1's seed.sql have the old tables but no migration history,
    /// so migrating them would fail on "table already exists". Stop with a clear
    /// message instead, or rebuild them when App:ResetLegacyDatabase is set.
    /// </summary>
    private static async Task EnsureNotLegacySchemaAsync(SebDbContext db, AppOptions options, ILogger logger, CancellationToken cancellationToken)
    {
        var connection = db.Database.GetDbConnection();
        await db.Database.OpenConnectionAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public.\"__EFMigrationsHistory\"') IS NULL";
            var isLegacy = (bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false);

            if (!isLegacy)
            {
                return;
            }

            if (!options.ResetLegacyDatabase)
            {
                logger.LogCritical(
                    "The database was created by the v1 seed.sql and has no migration history. Reset it once " +
                    "(locally: docker compose down -v, or ./start-local.ps1 -ResetDb; in stage/prod: request a " +
                    "database reset, or deploy once with App__ResetLegacyDatabase=true). See DRIFT.md.");
                throw new InvalidOperationException("Legacy v1 database schema detected; see the log for how to reset it.");
            }

            logger.LogWarning("Dropping the legacy v1 schema because App:ResetLegacyDatabase is enabled");
            command.CommandText =
                "DROP TABLE IF EXISTS transactions, audit_entries, approval_steps, payments, accounts, users, tenants CASCADE";
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    private static async Task<string> ResolveAuditKeyAsync(
        SebDbContext db, IServiceProvider provider, bool relational, ILogger logger, CancellationToken cancellationToken)
    {
        var configured = provider.GetRequiredService<IOptions<AuditOptions>>().Value.SigningKey;
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        if (!relational)
        {
            return InMemoryAuditKey;
        }

        var stored = await db.SystemSettings.FirstOrDefaultAsync(s => s.Key == AuditKeySetting, cancellationToken);
        if (stored is null)
        {
            stored = new SystemSetting { Key = AuditKeySetting, Value = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)) };
            db.SystemSettings.Add(stored);
            await db.SaveChangesAsync(cancellationToken);
        }

        logger.LogWarning(
            "Audit:SigningKey is not configured; using a generated key stored in the database. " +
            "Set Audit__SigningKey in deployed environments so the key lives outside the database.");
        return stored.Value;
    }
}
