namespace SebPortal.Api.DTOs;

public class DashboardPaymentStatusCountsDto
{
    public int Completed { get; set; }
    public int Processing { get; set; }
    public int PendingApproval { get; set; }
    public int Rejected { get; set; }
    public int Failed { get; set; }
}
