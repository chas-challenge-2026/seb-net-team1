namespace SebPortal.Api.DTOs;

/// <summary>
/// Response body for GET /api/approvals. See contracts/approvals-contract.md.
/// </summary>
public class ApprovalInboxResponse
{
    public List<PendingApprovalDto> Pending { get; set; } = new();
    public List<HandledApprovalDto> RecentlyHandled { get; set; } = new();
}
