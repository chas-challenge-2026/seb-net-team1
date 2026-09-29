using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Services;

/// <summary>
/// Creates notifications as part of the caller's unit of work (they are saved in the
/// same SaveChanges as the payment or decision that caused them) and serves the
/// in-app notification list. E-mail delivery happens afterwards in the background.
/// </summary>
public class NotificationService(SebDbContext dbContext)
{
    private const int MaxListSize = 50;

    public void Add(int tenantId, int recipientUserId, string type, string title, string message, int? paymentId)
    {
        dbContext.Notifications.Add(new Notification
        {
            TenantId = tenantId,
            RecipientUserId = recipientUserId,
            Type = type,
            Title = title,
            Message = message,
            PaymentId = paymentId,
            CreatedAt = DateTime.UtcNow,
            EmailStatus = EmailStatuses.Pending
        });
    }

    /// <summary>Tells an attestant that a payment is waiting for their decision.</summary>
    public void ApprovalRequested(Payment payment, int attestantId, int stepNumber, int totalSteps)
    {
        var stepText = totalSteps > 1 ? $" (steg {stepNumber} av {totalSteps})" : string.Empty;
        Add(payment.TenantId, attestantId, NotificationTypes.ApprovalRequested,
            $"Betalning väntar på din attest{stepText}",
            $"Betalning #{payment.Id} på {Money.Display(payment.Amount)} {payment.Currency} till {payment.ToIban}" +
            $"{ReferenceSuffix(payment)} väntar på din attest.",
            payment.Id);
    }

    public void PaymentCompleted(Payment payment)
    {
        if (payment.CreatedById is not { } creatorId)
        {
            return;
        }

        Add(payment.TenantId, creatorId, NotificationTypes.PaymentCompleted,
            "Din betalning är godkänd och genomförd",
            $"Betalning #{payment.Id} på {Money.Display(payment.Amount)} {payment.Currency} till {payment.ToIban}" +
            $"{ReferenceSuffix(payment)} har attesterats och genomförts.",
            payment.Id);
    }

    public void PaymentRejected(Payment payment, string rejectedByName, string? comment)
    {
        if (payment.CreatedById is not { } creatorId)
        {
            return;
        }

        Add(payment.TenantId, creatorId, NotificationTypes.PaymentRejected,
            "Din betalning har avvisats",
            $"Betalning #{payment.Id} på {Money.Display(payment.Amount)} {payment.Currency}{ReferenceSuffix(payment)} " +
            $"avvisades av {rejectedByName}." + (string.IsNullOrWhiteSpace(comment) ? string.Empty : $" Kommentar: {comment}"),
            payment.Id);
    }

    public async Task<NotificationListResponse> GetForUserAsync(int userId, int tenantId, int limit)
    {
        var take = Math.Clamp(limit, 1, MaxListSize);

        var items = await dbContext.Notifications
            .AsNoTracking()
            .Where(n => n.RecipientUserId == userId && n.TenantId == tenantId)
            .OrderByDescending(n => n.CreatedAt)
            .ThenByDescending(n => n.Id)
            .Take(take)
            .Select(n => new NotificationDto
            {
                Id = n.Id,
                Type = n.Type,
                Title = n.Title,
                Message = n.Message,
                PaymentId = n.PaymentId,
                CreatedAt = n.CreatedAt,
                ReadAt = n.ReadAt
            })
            .ToListAsync();

        var unreadCount = await dbContext.Notifications
            .CountAsync(n => n.RecipientUserId == userId && n.TenantId == tenantId && n.ReadAt == null);

        return new NotificationListResponse { Items = items, UnreadCount = unreadCount };
    }

    /// <returns>False when the notification does not exist or belongs to someone else.</returns>
    public async Task<bool> MarkAsReadAsync(int notificationId, int userId)
    {
        var notification = await dbContext.Notifications
            .FirstOrDefaultAsync(n => n.Id == notificationId && n.RecipientUserId == userId);

        if (notification is null)
        {
            return false;
        }

        notification.ReadAt ??= DateTime.UtcNow;
        await dbContext.SaveChangesAsync();
        return true;
    }

    public async Task MarkAllAsReadAsync(int userId)
    {
        var unread = await dbContext.Notifications
            .Where(n => n.RecipientUserId == userId && n.ReadAt == null)
            .ToListAsync();

        var now = DateTime.UtcNow;
        foreach (var notification in unread)
        {
            notification.ReadAt = now;
        }

        await dbContext.SaveChangesAsync();
    }

    private static string ReferenceSuffix(Payment payment) =>
        string.IsNullOrWhiteSpace(payment.Reference) ? string.Empty : $" ({payment.Reference})";
}
