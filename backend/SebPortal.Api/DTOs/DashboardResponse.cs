namespace SebPortal.Api.DTOs;

public class DashboardResponse
{
    public string? TenantName { get; set; }
    public AuthenticatedUserDto? User { get; set; }
    public List<AccountDto> Accounts { get; set; } = [];
    public List<PaymentSummaryDto> RecentPayments { get; set; } = [];
    public List<PaymentSummaryDto> PendingApprovals { get; set; } = [];
    public string? NextCursor { get; set; }
}
