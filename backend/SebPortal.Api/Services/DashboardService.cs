using System.Globalization;
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
        var recentPayments = await dashboardRepository.GetRecentPaymentsAsync(tenantId, RecentPaymentsCount);

        var pendingApprovals = new List<PaymentSummaryDto>();
        if (user.Role is "attestant" or "admin")
        {
            var pending = await dashboardRepository.GetPendingApprovalsAsync(userId, tenantId);
            pendingApprovals = pending.Select(ToPaymentSummaryDto).ToList();
        }

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
            RecentPayments = recentPayments.Select(ToPaymentSummaryDto).ToList(),
            PendingApprovals = pendingApprovals
        };
    }

    private static PaymentSummaryDto ToPaymentSummaryDto(Payment p) => new()
    {
        Id = p.Id,
        ToIban = p.ToIban,
        Amount = p.Amount.ToString("F2", CultureInfo.InvariantCulture),
        Currency = p.Currency,
        Reference = p.Reference ?? "",
        Status = p.Status,
        CreatedAt = p.CreatedAt
    };
}