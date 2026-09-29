using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class DashboardService(DashboardRepository dashboardRepository)
{
    private const int RecentPaymentsCount = 20;

    /// <returns>The dashboard data, or null if no matching user was found.</returns>
    public async Task<DashboardResponse?> GetDashboardAsync(int tenantId, int userId)
    {
        var user = await dashboardRepository.GetUserWithTenantAsync(userId, tenantId);
        if (user is null)
        {
            return null;
        }

        var accounts = await dashboardRepository.GetAccountsAsync(tenantId);
        var reserved = await dashboardRepository.GetReservedByAccountAsync(tenantId);
        var recentPayments = await dashboardRepository.GetRecentPaymentsAsync(tenantId, RecentPaymentsCount);

        var pendingApprovals = new List<PaymentSummaryDto>();
        if (user.Role is UserRoles.Attestant or UserRoles.Admin)
        {
            var pending = await dashboardRepository.GetPendingApprovalsAsync(
                userId, tenantId, includeUnassigned: user.Role == UserRoles.Admin);
            pendingApprovals = pending.Select(ToPaymentSummaryDto).ToList();
        }

        var accountDtos = accounts.Select(account => ToAccountDto(account, reserved)).ToList();

        return new DashboardResponse
        {
            TenantName = user.Tenant?.Name ?? "Okänt företag",
            User = AuthService.ToDto(user),
            Accounts = accountDtos,
            RecentPayments = recentPayments.Select(ToPaymentSummaryDto).ToList(),
            PendingApprovals = pendingApprovals,
            Stats = await BuildStatsAsync(tenantId, accounts, reserved, pendingApprovals.Count)
        };
    }

    public static AccountDto ToAccountDto(Account account, IReadOnlyDictionary<int, (decimal Amount, int Count)> reserved)
    {
        var (reservedAmount, pendingCount) = reserved.TryGetValue(account.Id, out var value) ? value : (0m, 0);

        return new AccountDto
        {
            Id = account.Id,
            AccountName = account.AccountName,
            Iban = account.Iban,
            Balance = Money.Format(account.Balance),
            AvailableBalance = Money.Format(account.Balance - reservedAmount),
            ReservedAmount = Money.Format(reservedAmount),
            Currency = account.Currency,
            PendingPaymentCount = pendingCount
        };
    }

    private async Task<DashboardStatsDto> BuildStatsAsync(
        int tenantId,
        List<Account> accounts,
        Dictionary<int, (decimal Amount, int Count)> reserved,
        int myPendingApprovalCount)
    {
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var thisMonth = await dashboardRepository.GetPaymentsSinceAsync(tenantId, monthStart);

        var totalBalance = accounts.Sum(a => a.Balance);
        var totalReserved = reserved.Values.Sum(v => v.Amount);
        var completed = thisMonth.Where(p => p.Status == PaymentStatuses.Completed).ToList();

        return new DashboardStatsDto
        {
            TotalBalance = Money.Format(totalBalance),
            AvailableBalance = Money.Format(totalBalance - totalReserved),
            PendingApprovalCount = await dashboardRepository.CountPendingPaymentsAsync(tenantId),
            MyPendingApprovalCount = myPendingApprovalCount,
            PaymentsThisMonthCount = thisMonth.Count,
            CompletedThisMonthCount = completed.Count,
            CompletedThisMonthAmount = Money.Format(completed.Sum(p => p.Amount)),
            RejectedThisMonthCount = thisMonth.Count(p => p.Status == PaymentStatuses.Rejected)
        };
    }

    private static PaymentSummaryDto ToPaymentSummaryDto(Payment p) => new()
    {
        Id = p.Id,
        ToIban = p.ToIban,
        Amount = Money.Format(p.Amount),
        Currency = p.Currency,
        Reference = p.Reference ?? "",
        Status = p.Status,
        CreatedAt = p.CreatedAt
    };
}
