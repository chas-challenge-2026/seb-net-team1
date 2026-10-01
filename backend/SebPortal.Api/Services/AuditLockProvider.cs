using System.Collections.Concurrent;

namespace SebPortal.Api.Services;

/// <summary>
/// One lock per tenant, shared across requests. Registered as a singleton,
/// AuditService is scoped, so the lock has to live somewhere that outlives a
/// single request or two concurrent requests would each get their own lock and
/// the whole point of locking is gone.
///
/// This is a single-process lock: correct because this API currently runs as one
/// backend container (see infra/docker-compose.yml). It would not be enough if
/// the API ever ran as more than one instance behind a load balancer, each
/// instance would have its own, unsynchronized locks. We can document a risk register line
/// if that ever changes, not relevant to how this is deployed now.
/// </summary>
public class AuditLockProvider
{
    private readonly ConcurrentDictionary<int, SemaphoreSlim> _locks = new();

    public SemaphoreSlim GetLock(int tenantId) =>
        _locks.GetOrAdd(tenantId, _ => new SemaphoreSlim(1, 1));
}