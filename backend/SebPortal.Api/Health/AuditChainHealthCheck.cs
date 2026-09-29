using System.Text.Json;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;

namespace SebPortal.Api.Health;

/// <summary>
/// Reports whether every tenant's audit chain is intact (native/README.md: the
/// verification "ska köras vid applikationsstart och rapporteras i healthcheck").
/// The result is cached for a few minutes so frequent health probes stay cheap.
/// </summary>
public sealed class AuditChainHealthCheck(IServiceScopeFactory scopeFactory) : IHealthCheck
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    private readonly SemaphoreSlim _lock = new(1, 1);
    private HealthCheckResult? _cached;
    private DateTime _cachedAt;

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        await _lock.WaitAsync(cancellationToken);
        try
        {
            if (_cached is { } cached && DateTime.UtcNow - _cachedAt < CacheDuration)
            {
                return cached;
            }

            using var scope = scopeFactory.CreateScope();
            var repository = scope.ServiceProvider.GetRequiredService<AuditLogRepository>();
            var service = scope.ServiceProvider.GetRequiredService<AuditLogService>();

            var broken = new List<string>();
            var checkedCount = 0;
            foreach (var tenantId in await repository.GetTenantIdsAsync())
            {
                var status = await service.VerifyChainAsync(tenantId, cancellationToken);
                checkedCount += status.CheckedCount;
                if (!status.Valid)
                {
                    broken.Add($"tenant {tenantId}: first invalid entry {status.FirstInvalidEntryId}");
                }
            }

            _cached = broken.Count == 0
                ? HealthCheckResult.Healthy($"{checkedCount} audit entries verified.")
                : HealthCheckResult.Unhealthy($"Audit chain broken ({string.Join("; ", broken)}).");
            _cachedAt = DateTime.UtcNow;
            return _cached.Value;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return HealthCheckResult.Unhealthy("Audit chain could not be verified.", ex);
        }
        finally
        {
            _lock.Release();
        }
    }
}

public static class HealthResponseWriter
{
    public static Task WriteAsync(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json; charset=utf-8";

        var body = new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(entry => new
            {
                name = entry.Key,
                status = entry.Value.Status.ToString(),
                description = entry.Value.Description
            })
        };

        return context.Response.WriteAsync(JsonSerializer.Serialize(body));
    }
}
