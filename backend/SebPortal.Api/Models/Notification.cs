namespace SebPortal.Api.Models;

/// <summary>
/// An in-app notification that is also delivered by e-mail through the background
/// queue (Notifications/NotificationDispatcher). The row doubles as the outbox and as
/// the delivery log: failed e-mails end up here with the error instead of being
/// swallowed like in v1 (BUG-007).
/// </summary>
public class Notification
{
    public int Id { get; set; }
    public int TenantId { get; set; }
    public int RecipientUserId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int? PaymentId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }

    public string EmailStatus { get; set; } = EmailStatuses.Pending;
    public int EmailAttempts { get; set; }
    public string? EmailLastError { get; set; }
    public DateTime? EmailSentAt { get; set; }

    public User? RecipientUser { get; set; }
}

public static class NotificationTypes
{
    public const string ApprovalRequested = "approval_requested";
    public const string PaymentCompleted = "payment_completed";
    public const string PaymentRejected = "payment_rejected";
}

public static class EmailStatuses
{
    public const string Pending = "pending";
    public const string Sent = "sent";
    public const string Failed = "failed";

    /// <summary>No SMTP server is configured, so there was nothing to deliver to.</summary>
    public const string Skipped = "skipped";
}
