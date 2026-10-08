using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class ReportRepository(SebDbContext db)
{
    public Task<bool> UserBelongsToTenantAsync(
        int userId, int tenantId, CancellationToken cancellationToken) =>
        db.Users.AsNoTracking()
            .AnyAsync(u => u.Id == userId && u.TenantId == tenantId, cancellationToken);

    public Task<List<ReportPayment>> GetPaymentsAsync(
        int tenantId,
        DateTime fromUtcInclusive,
        DateTime toUtcExclusive,
        CancellationToken cancellationToken)
    {
        IQueryable<Payment> payments;
        if (db.Database.IsNpgsql())
        {
            // The legacy created_at column is TIMESTAMP WITHOUT TIME ZONE, containing
            // UTC clock values. Explicit timestamp parameters avoid PostgreSQL converting
            // either side through the session time zone during the comparison.
            var from = UtcTimestampParameter("report_from", fromUtcInclusive);
            var to = UtcTimestampParameter("report_to", toUtcExclusive);
            payments = db.Payments.FromSql($"""
                SELECT * FROM payments
                WHERE tenant_id = {tenantId}
                  AND created_at >= {from}
                  AND created_at < {to}
                """);
        }
        else
        {
            payments = db.Payments.Where(p =>
                p.TenantId == tenantId &&
                p.CreatedAt >= fromUtcInclusive &&
                p.CreatedAt < toUtcExclusive);
        }

        return payments.AsNoTracking()
            // A left join preserves historical payments if their account is unavailable;
            // filtering the joined accounts also prevents cross-tenant name disclosure.
            .GroupJoin(
                db.Accounts.AsNoTracking().Where(a => a.TenantId == tenantId),
                p => p.FromAccountId,
                a => a.Id,
                (payment, accounts) => new { Payment = payment, Accounts = accounts })
            .SelectMany(
                joined => joined.Accounts.DefaultIfEmpty(),
                (joined, account) => new ReportPayment
                {
                    Id = joined.Payment.Id,
                    Reference = joined.Payment.Reference,
                    ToIban = joined.Payment.ToIban,
                    FromAccountName = account == null ? null : account.AccountName,
                    Amount = joined.Payment.Amount,
                    Currency = joined.Payment.Currency,
                    Status = joined.Payment.Status,
                    CreatedAt = joined.Payment.CreatedAt
                })
            .OrderByDescending(p => p.CreatedAt)
            .ThenByDescending(p => p.Id)
            .ToListAsync(cancellationToken);
    }

    private static NpgsqlParameter UtcTimestampParameter(string name, DateTime value) =>
        new(name, NpgsqlDbType.Timestamp)
        {
            Value = DateTime.SpecifyKind(value, DateTimeKind.Unspecified)
        };
}

public class ReportPayment
{
    public int Id { get; set; }
    public string? Reference { get; set; }
    public string ToIban { get; set; } = string.Empty;
    public string? FromAccountName { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
