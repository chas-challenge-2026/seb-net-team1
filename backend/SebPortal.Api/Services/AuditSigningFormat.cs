using System.Globalization;
using System.Text.Json;
using SebPortal.Api.Models;

namespace SebPortal.Api.Services;

/// <summary>
/// Builds the exact text that gets signed for an audit entry. The fields and
/// their order are fixed by this record, a signature is only reproducible if
/// the same entry always turns into the same text.
///
/// The database id is deliberately left out: it doesn't exist yet at signing
/// time, EF only assigns it when SaveChanges runs. The chain (PreviousSignature)
/// already gives ordering and tamper evidence without needing the id inside it.
/// </summary>
public static class AuditSigningFormat
{
    private record SignedFields(
        int TenantId,
        int? UserId,
        string Action,
        string? EntityType,
        int? EntityId,
        string? Description,
        string CreatedAt,
        string PreviousSignature);

    public static string Build(AuditEntry entry, string previousSignature)
    {
        var fields = new SignedFields(
            entry.TenantId,
            entry.UserId,
            entry.Action,
            entry.EntityType,
            entry.EntityId,
            entry.Description,
            FormatCreatedAt(entry.CreatedAt),
            previousSignature);

        return JsonSerializer.Serialize(fields);
    }

    private static string FormatCreatedAt(DateTime createdAt) =>
        DateTime.SpecifyKind(createdAt, DateTimeKind.Utc)
            .ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
}