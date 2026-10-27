using System.Globalization;
using SebPortal.Api.Auditing;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public sealed record AuditChainStatus(bool Valid, int CheckedCount, int? FirstInvalidEntryId);

public class AuditLogService(AuditLogRepository auditLogRepository, AuditSigningKeyProvider keyProvider)
{
    public const int DefaultLimit = 50;
    public const int MaxLimit = 200;

    /// <param name="cursor">The id of the last entry on the previous page, as returned in NextCursor.</param>
    public async Task<AuditLogResponse> GetAuditLogAsync(int tenantId, int? limit, string? cursor, AuditLogFilter? filter = null)
    {
        var pageSize = Math.Clamp(limit ?? DefaultLimit, 1, MaxLimit);
        int? beforeId = int.TryParse(cursor, NumberStyles.None, CultureInfo.InvariantCulture, out var id) ? id : null;

        // Fetch one extra entry to know whether there is another page.
        var entries = await auditLogRepository.GetForTenantAsync(tenantId, pageSize + 1, beforeId, filter);
        var hasMore = entries.Count > pageSize;
        var page = entries.Take(pageSize).ToList();

        return new AuditLogResponse
        {
            Entries = page.Select(ToDto).ToList(),
            NextCursor = hasMore ? page[^1].Id.ToString(CultureInfo.InvariantCulture) : null
        };
    }

    /// <summary>
    /// Walks the tenant's chain and recomputes every link. Returns the first entry
    /// whose position, previous hash or HMAC does not match, i.e. the first row that
    /// was edited, deleted, inserted or reordered outside the application.
    /// </summary>
    public async Task<AuditChainStatus> VerifyChainAsync(int tenantId, CancellationToken cancellationToken = default)
    {
        var hasher = keyProvider.Hasher;
        var expectedIndex = 1L;
        var previousHash = AuditHasher.GenesisHash;
        var checkedCount = 0;

        await foreach (var entry in auditLogRepository.StreamChainAsync(tenantId).WithCancellation(cancellationToken))
        {
            checkedCount++;

            var linked = entry.ChainIndex == expectedIndex && entry.PreviousHash == previousHash;
            if (!linked || !hasher.IsValid(entry))
            {
                return new AuditChainStatus(false, checkedCount, entry.Id);
            }

            previousHash = entry.Hash;
            expectedIndex++;
        }

        return new AuditChainStatus(true, checkedCount, null);
    }

    public static AuditLogEntryDto ToDto(AuditEntry e) => new()
    {
        Id = e.Id,
        Action = e.Action,
        EntityType = e.EntityType ?? string.Empty,
        EntityId = e.EntityId,
        Description = e.Description ?? string.Empty,
        CreatedAt = e.CreatedAt,
        UserName = e.User?.Name ?? "Systemet"
    };
}
