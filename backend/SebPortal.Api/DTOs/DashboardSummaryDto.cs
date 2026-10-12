namespace SebPortal.Api.DTOs;

public class DashboardSummaryDto
{
    /// <summary>SEK balances across the tenant's accounts, formatted without locale ambiguity.</summary>
    public string TotalBalance { get; set; } = "0.00";
    public int PendingApprovals { get; set; }
    public int TotalPayments { get; set; }
    public int ValidationErrors { get; set; }
}
