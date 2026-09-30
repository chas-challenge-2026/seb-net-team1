using System.Globalization;
using System.Text;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Signing;

namespace SebPortal.Api.Services;

public class AuditService(
    AuditRepository auditRepository,
    AuditLockProvider lockProvider,
    IAuditSigner signer)
{
    private const string GenesisSignature = "GENESIS";

    /// <summary>
    /// One lock per tenant. Means wait on it before reading or appending anything for
    /// that tenant, and don't release it until the entry has actually been
    /// saved, releasing earlier would let a second call read the same "latest
    /// signature" before this one's row is really the latest, and the chain
    /// would fork instead of link. See ApprovalService.DecideAsync for the
    /// standard try/finally shape this is used with.
    /// </summary>
    public SemaphoreSlim GetTenantLock(int tenantId) => lockProvider.GetLock(tenantId);

    /// <summary>
    /// Builds, signs, and tracks (but does not save) one audit entry as the next
    /// link in the tenant's chain. Caller must already be holding the tenant's
    /// lock (GetTenantLock) and must call SaveChangesAsync before releasing it.
    ///
    /// Doesn't save by itself so it can be bundled into the caller's own
    /// SaveChangesAsync together with other changes, same reason
    /// PaymentService.CompletePayment doesn't save either: it lets the caller
    /// decide what counts as one atomic write.
    /// </summary>
    public async Task AppendEntryAsync(
        int tenantId, int? userId, string action, string? entityType, int? entityId, string? description)
    {
        var previousSignature = await auditRepository.GetLatestSignatureAsync(tenantId) ?? GenesisSignature;

        var entry = new AuditEntry
        {
            TenantId = tenantId,
            UserId = userId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Description = description,
            CreatedAt = DateTime.UtcNow,
            PreviousSignature = previousSignature
        };

        entry.Signature = signer.Sign(AuditSigningFormat.Build(entry, previousSignature));

        auditRepository.Append(entry);
    }

    /// <summary>
    /// For a caller with nothing else to save in the same unit of work. The
    /// approval flow doesn't use this, it bundles the audit entry into its own
    /// single SaveChangesAsync instead, see ApprovalService.DecideAsync.
    /// </summary>
    public async Task LogImmediatelyAsync(
        int tenantId, int? userId, string action, string? entityType, int? entityId, string? description)
    {
        var tenantLock = GetTenantLock(tenantId);
        await tenantLock.WaitAsync();

        try
        {
            await AppendEntryAsync(tenantId, userId, action, entityType, entityId, description);
            await auditRepository.SaveChangesAsync();
        }
        finally
        {
            tenantLock.Release();
        }
    }

    public async Task<AuditLogResponseDto> GetAuditLogAsync(int tenantId, int limit, string? cursor)
    {
        var beforeId = DecodeCursor(cursor);

        var rows = await auditRepository.GetPageAsync(tenantId, limit, beforeId);

        var hasMore = rows.Count > limit;
        var page = hasMore ? rows.Take(limit).ToList() : rows;

        return new AuditLogResponseDto
        {
            Entries = page.Select(ToDto).ToList(),
            NextCursor = hasMore ? EncodeCursor(page[^1].Id) : null
        };
    }

    private static AuditEntryDto ToDto(AuditEntry entry) => new()
    {
        Id = entry.Id,
        Action = entry.Action,
        EntityType = entry.EntityType,
        EntityId = entry.EntityId,
        Description = entry.Description ?? "",
        CreatedAt = entry.CreatedAt,
        UserName = entry.User?.Name ?? "Systemet"
    };

    /// <summary>Opaque to the client, just a base64-encoded id.</summary>
    private static int? DecodeCursor(string? cursor)
    {
        if (string.IsNullOrWhiteSpace(cursor))
        {
            return null;
        }

        try
        {
            var idAsText = Encoding.UTF8.GetString(Convert.FromBase64String(cursor));
            return int.Parse(idAsText, CultureInfo.InvariantCulture);
        }
        catch
        {
            // A malformed cursor falls back to the first page instead of failing
            // the request, there's no value the client could usefully retry with.
            return null;
        }
    }

    private static string EncodeCursor(int id) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes(id.ToString(CultureInfo.InvariantCulture)));
}