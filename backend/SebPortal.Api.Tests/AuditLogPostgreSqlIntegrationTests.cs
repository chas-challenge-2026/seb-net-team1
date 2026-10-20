using Microsoft.EntityFrameworkCore;
using Npgsql;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Signing;

namespace SebPortal.Api.Tests;

/// <summary>Checks the actual PostgreSQL queries and the timestamp type used by infra/seed.sql.</summary>
public sealed class AuditLogPostgreSqlIntegrationTests(PostgreSqlFixture postgres)
    : IClassFixture<PostgreSqlFixture>
{
    [Theory]
    [InlineData("UTC")]
    [InlineData("Europe/Stockholm")]
    public async Task Filters_MetadataAndPagination_UseUtcAndStayWithinTenant(string sessionTimeZone)
    {
        var schema = $"audit_filters_{Guid.NewGuid():N}";
        await using var admin = new NpgsqlConnection(postgres.ConnectionString);
        await admin.OpenAsync();
        await ExecuteAsync(admin, $"CREATE SCHEMA {schema}");

        try
        {
            var connectionString = new NpgsqlConnectionStringBuilder(postgres.ConnectionString)
            {
                SearchPath = schema,
                Options = $"-c timezone={sessionTimeZone}"
            }.ConnectionString;
            var options = new DbContextOptionsBuilder<SebDbContext>().UseNpgsql(connectionString).Options;
            await using var db = new SebDbContext(options);
            await db.Database.ExecuteSqlRawAsync(db.Database.GenerateCreateScript());

            // Enforce the deployed seed's TIMESTAMP type even if EF's mapping changes.
            // The table is empty here, so this does not alter historical rows.
            await db.Database.ExecuteSqlRawAsync("""
                ALTER TABLE audit_entries ALTER COLUMN created_at
                    TYPE timestamp without time zone USING created_at AT TIME ZONE 'UTC';
                INSERT INTO tenants (id, name) VALUES (1, 'First'), (2, 'Second');
                INSERT INTO users (id, tenant_id, name, email, role) VALUES
                    (1, 1, 'Sara Ek', 'sara@example.invalid', 'admin'),
                    (2, 1, 'Johan Berg', 'johan@example.invalid', 'attestant'),
                    (3, 2, 'Other Tenant User', 'other@example.invalid', 'admin');
                INSERT INTO audit_entries
                    (id, tenant_id, user_id, action, entity_type, entity_id, description,
                     created_at, ip_address, signature, previous_signature) VALUES
                    (1, 1, 1, 'CREATE_PAYMENT', 'payment', 501, 'Hyra', '2026-10-14 09:59:59.999999', '2001:db8::1', 'test', 'test'),
                    (2, 1, 1, 'CREATE_PAYMENT', 'payment', 502, 'HYRA', '2026-10-14 10:00:00', '2001:db8::1', 'test', 'test'),
                    (3, 1, 2, 'APPROVE_PAYMENT', 'payment', 502, 'Hyra', '2026-10-14 10:01:00', '2001:db8::1', 'test', 'test'),
                    (4, 1, 1, 'CREATE_PAYMENT', 'payment', 504, 'Hyra', '2026-10-14 10:29:59.999999', '2001:db8::1', 'test', 'test'),
                    (5, 1, 1, 'CREATE_PAYMENT', 'payment', 505, 'Hyra', '2026-10-14 10:30:00', '2001:db8::1', 'test', 'test'),
                    (6, 2, 3, 'CREATE_PAYMENT', 'payment', 506, 'Hyra', '2026-10-14 10:05:00', '2001:db8::1', 'test', 'test'),
                    (7, 1, 1, 'CREATE_PAYMENT', 'payment', 507, 'El', '2026-10-14 10:05:00', '2001:db8::1', 'test', 'test'),
                    (8, 1, NULL, 'SYSTEM_EVENT', NULL, NULL, NULL, '2026-10-14 10:05:00', NULL, 'test', 'test'),
                    (9, 1, 1, 'OLD_ACTION', 'payment', 509, 'Hyra', '2026-10-14 09:00:00', '2001:db8::1', 'test', 'test'),
                    (10, 1, 3, 'OTHER_ACTION', 'payment', 510, NULL, '2026-10-14 10:10:00', NULL, 'test', 'test'),
                    (11, 1, 1, 'CREATE_PAYMENT', 'payment', 511, 'Hyra', '2026-10-14 10:15:00', '2001:db8::1', 'test', 'test');
                """);
            var service = new AuditService(new AuditRepository(db), new AuditLockProvider(),
                new UnsignedPlaceholderAuditSigner());
            var filters = new AuditLogQuery
            {
                Search = " hYrA ", Action = "CREATE_PAYMENT", UserId = 1,
                From = DateTimeOffset.Parse("2026-10-14T12:00:00+02:00"),
                To = DateTimeOffset.Parse("2026-10-14T12:30:00+02:00")
            };
            var original = await db.AuditEntries.AsNoTracking().SingleAsync(entry => entry.Id == 2);
            var signedText = AuditSigningFormat.Build(original, original.PreviousSignature);

            var first = await service.GetAuditLogAsync(1, 1, null, filters);
            var second = await service.GetAuditLogAsync(1, 1, first.NextCursor, filters);
            var last = await service.GetAuditLogAsync(1, 1, second.NextCursor, filters);

            Assert.Equal(11, Assert.Single(first.Entries).Id);
            Assert.NotNull(first.NextCursor);
            Assert.Equal(4, Assert.Single(second.Entries).Id);
            Assert.NotNull(second.NextCursor);
            Assert.Equal(2, Assert.Single(last.Entries).Id);
            Assert.Null(last.NextCursor);

            var metadata = await service.GetFiltersAsync(1);
            Assert.Equal(new[] { "APPROVE_PAYMENT", "CREATE_PAYMENT", "OLD_ACTION", "OTHER_ACTION", "SYSTEM_EVENT" }, metadata.Actions);
            Assert.Equal(new[] { 2, 1, 0 }, metadata.Users.Select(user => user.Id));
            Assert.Equal(new[] { "Johan Berg", "Sara Ek", "Systemet" }, metadata.Users.Select(user => user.Name));
            var numericSearch = await service.GetAuditLogAsync(1, 50, null, new AuditLogQuery { Search = "502" });
            Assert.Equal(new[] { 3, 2 }, numericSearch.Entries.Select(entry => entry.Id));
            var labelSearch = await service.GetAuditLogAsync(1, 50, null,
                new AuditLogQuery { Search = "Skapade en betalning" });
            Assert.Equal(new[] { 11, 7, 5, 4, 2, 1 }, labelSearch.Entries.Select(entry => entry.Id));
            var prefixedIdSearch = await service.GetAuditLogAsync(1, 50, null,
                new AuditLogQuery { Search = "#502" });
            Assert.Equal(new[] { 3, 2 }, prefixedIdSearch.Entries.Select(entry => entry.Id));
            var nameSearch = await service.GetAuditLogAsync(1, 50, null, new AuditLogQuery { Search = "sArA" });
            Assert.Equal(new[] { 11, 9, 7, 5, 4, 2, 1 }, nameSearch.Entries.Select(entry => entry.Id));
            var crossTenantSearch = await service.GetAuditLogAsync(1, 50, null,
                new AuditLogQuery { Search = "Other Tenant User" });
            Assert.Empty(crossTenantSearch.Entries);
            var system = await service.GetAuditLogAsync(1, 50, null, new AuditLogQuery { UserId = 0 });
            Assert.Equal(8, Assert.Single(system.Entries).Id);

            var unchanged = await db.AuditEntries.AsNoTracking().SingleAsync(entry => entry.Id == 2);
            Assert.Equal(DateTimeKind.Unspecified, unchanged.CreatedAt.Kind);
            Assert.Equal(new DateTime(2026, 10, 14, 10, 0, 0), unchanged.CreatedAt);
            Assert.Equal(signedText, AuditSigningFormat.Build(unchanged, unchanged.PreviousSignature));
            Assert.Equal("test", unchanged.Signature);
            Assert.Equal("test", unchanged.PreviousSignature);
        }
        finally
        {
            // Only this test's generated schema in disposable Testcontainers PostgreSQL.
            await ExecuteAsync(admin, $"DROP SCHEMA {schema} CASCADE");
        }
    }

    private static async Task ExecuteAsync(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }
}
