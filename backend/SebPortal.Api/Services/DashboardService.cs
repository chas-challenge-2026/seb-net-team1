using System.Globalization;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class DashboardService(DashboardRepository dashboardRepository)
{
    private const int UpcomingPaymentsCount = 20;
    private const int RecentActivityCount = 5;

    /// <returns>The dashboard data, or null if no matching user was found.</returns>
    public async Task<DashboardResponse?> GetDashboardAsync(int tenantId, int userId)
    {
        var user = await dashboardRepository.GetUserWithTenantAsync(userId, tenantId);
        if (user is null)
        {
            return null;
        }

        var accounts = await dashboardRepository.GetAccountsAsync(tenantId);
        var payments = await dashboardRepository.GetPaymentsAsync(tenantId);
        var pendingApprovals = await dashboardRepository.GetPendingApprovalsAsync(tenantId);
        var upcomingPayments = await dashboardRepository.GetUpcomingPaymentsAsync(tenantId, UpcomingPaymentsCount);
        var statusCounts = await dashboardRepository.GetPaymentStatusCountsAsync(tenantId);
        var totalPayments = await dashboardRepository.GetPaymentCountAsync(tenantId);
        var validationErrors = await dashboardRepository.GetValidationErrorCountAsync(tenantId);
        var recentActivity = await dashboardRepository.GetRecentPaymentActivityAsync(tenantId, RecentActivityCount);

        return new DashboardResponse
        {
            TenantName = user.Tenant?.Name ?? "Okänt företag",
            User = new AuthenticatedUserDto
            {
                Id = user.Id,
                Name = user.Name,
                Email = user.Email,
                Role = user.Role,
                TenantId = user.TenantId
            },
            Accounts = accounts.Select(a => new AccountDto
            {
                Id = a.Id,
                AccountName = a.AccountName,
                Iban = a.Iban,
                Balance = a.Balance.ToString("F2", CultureInfo.InvariantCulture),
                Currency = a.Currency
            }).ToList(),
            RecentPayments = payments.Select(ToPaymentSummaryDto).ToList(),
            PendingApprovals = pendingApprovals.Select(ToPaymentSummaryDto).ToList(),
            UpcomingPayments = upcomingPayments.Select(ToPaymentSummaryDto).ToList(),
            RecentActivity = recentActivity.Select(entry => new AuditEntryDto
            {
                Id = entry.Id,
                Action = entry.Action,
                EntityType = entry.EntityType,
                EntityId = entry.EntityId,
                Description = entry.Description ?? string.Empty,
                CreatedAt = DateTime.SpecifyKind(entry.CreatedAt, DateTimeKind.Utc),
                UserName = entry.User?.Name ?? "Systemet"
            }).ToList(),
            Summary = new DashboardSummaryDto
            {
                TotalBalance = accounts
                    .Where(account => account.Currency == "SEK")
                    .Sum(account => account.Balance)
                    .ToString("F2", CultureInfo.InvariantCulture),
                PendingApprovals = CountStatus(statusCounts, PaymentStatuses.PendingApproval),
                TotalPayments = totalPayments,
                ValidationErrors = validationErrors
            },
            PaymentStatusCounts = new DashboardPaymentStatusCountsDto
            {
                Completed = CountStatus(statusCounts, PaymentStatuses.Completed),
                Processing = CountStatus(statusCounts, "processing"),
                PendingApproval = CountStatus(statusCounts, PaymentStatuses.PendingApproval),
                Rejected = CountStatus(statusCounts, PaymentStatuses.Rejected),
                Failed = CountStatus(statusCounts, "failed")
            }
        };
    }

    private static int CountStatus(IReadOnlyDictionary<string, int> statusCounts, string status) =>
        statusCounts.TryGetValue(status, out var count) ? count : 0;

    private static PaymentSummaryDto ToPaymentSummaryDto(Payment p) => new()
    {
        Id = p.Id,
        FromAccountId = p.FromAccountId,
        FromAccountName = p.FromAccount?.AccountName,
        CreatedByName = p.CreatedBy?.Name,
        ToIban = p.ToIban,
        Amount = p.Amount.ToString("F2", CultureInfo.InvariantCulture),
        Currency = p.Currency,
        Reference = p.Reference ?? "",
        Status = p.Status,
        CreatedAt = DateTime.SpecifyKind(p.CreatedAt, DateTimeKind.Utc),
        ExecutedAt = p.ExecutedAt is null
            ? null
            : DateTime.SpecifyKind(p.ExecutedAt.Value, DateTimeKind.Utc)
    };
}
