using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Auditing;

namespace SebPortal.Api.Data;

/// <summary>
/// Runs work that needs more than one SaveChanges (e.g. a payment first, then the
/// audit entry and notifications that reference its generated id) in one database
/// transaction, so either everything is committed or nothing is. v1 wrote payments,
/// approval steps and audit rows with separate commands and no transaction (BUG-005).
/// </summary>
public class UnitOfWork(SebDbContext dbContext)
{
    /// <summary>
    /// Runs <paramref name="work"/> in a transaction that first takes the tenant's audit
    /// lock. Every audit writing transaction takes that lock before any row lock (the
    /// audit interceptor takes it again, which PostgreSQL allows within a transaction),
    /// so two transactions can never wait for each other in opposite order (deadlock).
    /// It also serializes balance checks within a tenant, which keeps optimistic
    /// concurrency conflicts rare.
    /// </summary>
    public async Task<T> RunAsync<T>(int tenantId, Func<Task<T>> work)
    {
        // The in-memory provider used by the unit tests has no transactions.
        if (!dbContext.Database.IsRelational() || dbContext.Database.CurrentTransaction is not null)
        {
            return await work();
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync();
        await dbContext.Database.ExecuteSqlRawAsync(
            AuditChainInterceptor.AdvisoryLockSql, AuditChainInterceptor.AdvisoryLockClass, tenantId);

        var result = await work();
        await transaction.CommitAsync();
        return result;
    }

    public Task SaveChangesAsync() => dbContext.SaveChangesAsync();
}
