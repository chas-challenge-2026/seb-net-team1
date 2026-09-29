namespace SebPortal.Api.DTOs;

/// <summary>GET /api/config: the business rules the frontend shows but must never hardcode.</summary>
public class ConfigResponse
{
    public string ApprovalThreshold { get; set; } = string.Empty;
    public string DoubleApprovalThreshold { get; set; } = string.Empty;
    public string Currency { get; set; } = "SEK";
    public long MaxBatchFileSizeBytes { get; set; }
    public int MaxBatchRows { get; set; }
}

public class DashboardStatsDto
{
    public string TotalBalance { get; set; } = "0.00";
    public string AvailableBalance { get; set; } = "0.00";

    /// <summary>Payments waiting for attest in the whole tenant.</summary>
    public int PendingApprovalCount { get; set; }

    /// <summary>Approval steps waiting for the current user.</summary>
    public int MyPendingApprovalCount { get; set; }

    public int PaymentsThisMonthCount { get; set; }
    public int CompletedThisMonthCount { get; set; }
    public string CompletedThisMonthAmount { get; set; } = "0.00";
    public int RejectedThisMonthCount { get; set; }
}

public class NotificationDto
{
    public int Id { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int? PaymentId { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReadAt { get; set; }
}

public class NotificationListResponse
{
    public List<NotificationDto> Items { get; set; } = [];
    public int UnreadCount { get; set; }
}

public class UserAdminDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CreateUserRequest
{
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Role { get; set; }
    public string? Password { get; set; }
}

public class UpdateUserRequest
{
    public string? Name { get; set; }
    public string? Role { get; set; }
    public bool IsActive { get; set; } = true;
}

public class ResetPasswordRequest
{
    public string? NewPassword { get; set; }
}

public class MonthStatDto
{
    /// <summary>"yyyy-MM".</summary>
    public string Month { get; set; } = string.Empty;
    public int CompletedCount { get; set; }
    public string CompletedAmount { get; set; } = "0.00";
    public int PendingCount { get; set; }
    public string PendingAmount { get; set; } = "0.00";
    public int RejectedCount { get; set; }
    public string RejectedAmount { get; set; } = "0.00";
}

public class StatusStatDto
{
    public string Status { get; set; } = string.Empty;
    public int Count { get; set; }
    public string Amount { get; set; } = "0.00";
}

public class RecipientStatDto
{
    public string ToIban { get; set; } = string.Empty;
    public int Count { get; set; }
    public string Amount { get; set; } = "0.00";
}

public class ReportSummaryResponse
{
    public List<MonthStatDto> Months { get; set; } = [];
    public List<StatusStatDto> ByStatus { get; set; } = [];
    public List<RecipientStatDto> TopRecipients { get; set; } = [];
}

public class IbanValidationResponse
{
    public bool Valid { get; set; }
    public string Normalized { get; set; } = string.Empty;
    public string Formatted { get; set; } = string.Empty;
    public string? CountryCode { get; set; }
    public int ErrorCode { get; set; }
    public string Message { get; set; } = string.Empty;
}

public class AuditChainVerificationResponse
{
    public bool Valid { get; set; }
    public int CheckedCount { get; set; }
    public int? FirstInvalidEntryId { get; set; }
    public DateTime VerifiedAt { get; set; }
}
