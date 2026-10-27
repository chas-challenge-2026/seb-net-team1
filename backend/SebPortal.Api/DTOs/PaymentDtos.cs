namespace SebPortal.Api.DTOs;

/// <summary>Query string for GET /api/payments and GET /api/payments/export.</summary>
public class PaymentListQuery
{
    public string? Status { get; set; }
    public int? AccountId { get; set; }
    public string? Search { get; set; }
    public DateOnly? FromDate { get; set; }
    public DateOnly? ToDate { get; set; }
    public bool CreatedByMe { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public class ApprovalProgressDto
{
    public int Approved { get; set; }
    public int Required { get; set; }
}

public class PaymentListItemDto
{
    public int Id { get; set; }
    public int FromAccountId { get; set; }
    public string FromAccountName { get; set; } = string.Empty;
    public string ToIban { get; set; } = string.Empty;
    public string Amount { get; set; } = string.Empty;
    public string Currency { get; set; } = "SEK";
    public string Reference { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? ExecutedAt { get; set; }
    public int? CreatedById { get; set; }
    public string CreatedByName { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;

    /// <summary>Null when the payment never needed attest.</summary>
    public ApprovalProgressDto? ApprovalProgress { get; set; }
}

public class ApprovalStepInfoDto
{
    public int Id { get; set; }
    public int StepNumber { get; set; }
    public int? AttestantId { get; set; }
    public string? AttestantName { get; set; }
    public string Status { get; set; } = string.Empty;
    public DateTime? DecidedAt { get; set; }
    public string? Comment { get; set; }
}

public class PaymentDetailDto : PaymentListItemDto
{
    public string FromAccountIban { get; set; } = string.Empty;
    public bool RequiresApproval { get; set; }
    public bool RequiresDoubleApproval { get; set; }
    public List<ApprovalStepInfoDto> ApprovalSteps { get; set; } = [];

    /// <summary>The step the current user may decide right now, if any.</summary>
    public int? MyApprovalStepId { get; set; }

    /// <summary>The payment's audit trail, oldest first.</summary>
    public List<AuditLogEntryDto> Events { get; set; } = [];
}

public class BatchRowDto
{
    public int RowNumber { get; set; }
    public int? FromAccountId { get; set; }
    public string? FromAccountName { get; set; }
    public string ToIban { get; set; } = string.Empty;
    public string? Amount { get; set; }
    public string Reference { get; set; } = string.Empty;
    public bool RequiresApproval { get; set; }
    public List<string> Errors { get; set; } = [];
}

public class BatchValidationResponse
{
    public string FileName { get; set; } = string.Empty;

    /// <summary>"native" or "managed", which CSV parser handled the file.</summary>
    public string Parser { get; set; } = string.Empty;

    public int RowCount { get; set; }
    public int ValidRowCount { get; set; }
    public int InvalidRowCount { get; set; }
    public string TotalAmount { get; set; } = "0.00";
    public int DirectPaymentCount { get; set; }
    public int ApprovalRequiredCount { get; set; }

    /// <summary>Problems with the file itself (size, header, quoting).</summary>
    public List<string> FileErrors { get; set; } = [];

    public List<BatchRowDto> Rows { get; set; } = [];

    public bool IsValid => FileErrors.Count == 0 && Rows.Count > 0 && Rows.All(row => row.Errors.Count == 0);
}

public class BatchResultDto
{
    public int CreatedCount { get; set; }
    public int CompletedCount { get; set; }
    public int PendingApprovalCount { get; set; }
    public string TotalAmount { get; set; } = "0.00";
    public List<PaymentResponseDto> Payments { get; set; } = [];
}
