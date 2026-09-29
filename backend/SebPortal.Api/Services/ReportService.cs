using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Services;

public class ReportService(SebDbContext dbContext)
{
    public async Task<ReportSummaryResponse> GetSummaryAsync(int tenantId, int months)
    {
        months = Math.Clamp(months, 1, 24);

        var now = DateTime.UtcNow;
        var firstMonth = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-(months - 1));

        var payments = await dbContext.Payments
            .AsNoTracking()
            .Where(p => p.TenantId == tenantId && p.CreatedAt >= firstMonth)
            .Select(p => new { p.CreatedAt, p.Status, p.Amount, p.ToIban })
            .ToListAsync();

        var monthStats = Enumerable.Range(0, months)
            .Select(offset => firstMonth.AddMonths(offset))
            .Select(month =>
            {
                var inMonth = payments.Where(p => p.CreatedAt.Year == month.Year && p.CreatedAt.Month == month.Month).ToList();
                var completed = inMonth.Where(p => p.Status == PaymentStatuses.Completed).ToList();
                var pending = inMonth.Where(p => p.Status == PaymentStatuses.PendingApproval).ToList();
                var rejected = inMonth.Where(p => p.Status == PaymentStatuses.Rejected).ToList();

                return new MonthStatDto
                {
                    Month = month.ToString("yyyy-MM", CultureInfo.InvariantCulture),
                    CompletedCount = completed.Count,
                    CompletedAmount = Money.Format(completed.Sum(p => p.Amount)),
                    PendingCount = pending.Count,
                    PendingAmount = Money.Format(pending.Sum(p => p.Amount)),
                    RejectedCount = rejected.Count,
                    RejectedAmount = Money.Format(rejected.Sum(p => p.Amount))
                };
            })
            .ToList();

        var byStatus = PaymentStatuses.All
            .Select(status =>
            {
                var matching = payments.Where(p => p.Status == status).ToList();
                return new StatusStatDto
                {
                    Status = status,
                    Count = matching.Count,
                    Amount = Money.Format(matching.Sum(p => p.Amount))
                };
            })
            .ToList();

        var topRecipients = payments
            .Where(p => p.Status == PaymentStatuses.Completed)
            .GroupBy(p => p.ToIban)
            .Select(g => new { Iban = g.Key, Count = g.Count(), Amount = g.Sum(p => p.Amount) })
            .OrderByDescending(g => g.Amount)
            .Take(5)
            .Select(g => new RecipientStatDto { ToIban = g.Iban, Count = g.Count, Amount = Money.Format(g.Amount) })
            .ToList();

        return new ReportSummaryResponse
        {
            Months = monthStats,
            ByStatus = byStatus,
            TopRecipients = topRecipients
        };
    }
}
