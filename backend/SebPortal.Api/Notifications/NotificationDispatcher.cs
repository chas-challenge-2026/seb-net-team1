using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Options;

namespace SebPortal.Api.Notifications;

/// <summary>
/// Delivers one notification by e-mail with retries. Separate from the hosted
/// service so it can be tested with a fake <see cref="IEmailSender"/>.
/// </summary>
public sealed class NotificationDeliveryService(
    SebDbContext dbContext,
    IEmailSender emailSender,
    IOptions<SmtpOptions> smtpOptions,
    IOptions<AppOptions> appOptions,
    ILogger<NotificationDeliveryService> logger)
{
    public async Task DeliverAsync(int notificationId, CancellationToken cancellationToken)
    {
        var notification = await dbContext.Notifications
            .Include(n => n.RecipientUser)
            .FirstOrDefaultAsync(n => n.Id == notificationId, cancellationToken);

        // Missing: not committed yet (the sweep will find it later) or deleted.
        if (notification is null || notification.EmailStatus != EmailStatuses.Pending)
        {
            return;
        }

        var smtp = smtpOptions.Value;
        var recipient = notification.RecipientUser;

        if (!smtp.IsConfigured || recipient is null || string.IsNullOrWhiteSpace(recipient.Email))
        {
            notification.EmailStatus = EmailStatuses.Skipped;
            await dbContext.SaveChangesAsync(cancellationToken);
            return;
        }

        var message = BuildMessage(notification, recipient);
        var maxAttempts = Math.Max(1, smtp.MaxAttempts);

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            notification.EmailAttempts = attempt;

            try
            {
                await emailSender.SendAsync(message, cancellationToken);

                notification.EmailStatus = EmailStatuses.Sent;
                notification.EmailSentAt = DateTime.UtcNow;
                notification.EmailLastError = null;
                await dbContext.SaveChangesAsync(cancellationToken);

                logger.LogInformation(
                    "Notification {NotificationId} e-mailed to user {UserId} on attempt {Attempt}",
                    notification.Id, recipient.Id, attempt);
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                notification.EmailLastError = Truncate($"{ex.GetType().Name}: {ex.Message}", 1000);

                logger.LogWarning(ex,
                    "E-mail for notification {NotificationId} failed on attempt {Attempt} of {MaxAttempts}",
                    notification.Id, attempt, maxAttempts);

                if (attempt < maxAttempts)
                {
                    // Exponential backoff: base, 2 x base, 4 x base ...
                    var delay = TimeSpan.FromMilliseconds(smtp.RetryBaseDelayMilliseconds * Math.Pow(2, attempt - 1));
                    await Task.Delay(delay, cancellationToken);
                }
            }
        }

        // Every attempt failed. Unlike v1 (catch { }), the failure is recorded in the
        // database and logged as an error so it can be followed up.
        notification.EmailStatus = EmailStatuses.Failed;
        await dbContext.SaveChangesAsync(cancellationToken);

        logger.LogError(
            "E-mail for notification {NotificationId} to user {UserId} failed after {MaxAttempts} attempts: {Error}",
            notification.Id, recipient.Id, maxAttempts, notification.EmailLastError);
    }

    private EmailMessage BuildMessage(Notification notification, User recipient)
    {
        var baseUrl = appOptions.Value.PublicUrl.TrimEnd('/');
        var link = notification.PaymentId is { } paymentId ? $"{baseUrl}/payments/{paymentId}" : baseUrl;

        var text = $"Hej {recipient.Name},\n\n{notification.Message}\n\nÖppna portalen: {link}\n\nMvh\nSEB Företagsbetalningar";
        var html =
            $"<p>Hej {WebUtility.HtmlEncode(recipient.Name)},</p>" +
            $"<p>{WebUtility.HtmlEncode(notification.Message)}</p>" +
            $"<p><a href=\"{WebUtility.HtmlEncode(link)}\">Öppna i SEB Företagsbetalningar</a></p>" +
            "<p>Mvh<br>SEB Företagsbetalningar</p>";

        return new EmailMessage(recipient.Email, recipient.Name, notification.Title, text, html);
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];
}

/// <summary>
/// Background worker (IHostedService) that drains <see cref="NotificationQueue"/> and
/// periodically sweeps the database for pending notifications, so nothing is lost if
/// the process restarts between saving a notification and sending it.
/// </summary>
public sealed class NotificationDispatcher(
    NotificationQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<NotificationDispatcher> logger) : BackgroundService
{
    private static readonly TimeSpan SweepInterval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Give migrations and seeding a moment to finish before the first sweep.
        await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepAsync(stoppingToken);

                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                timeout.CancelAfter(SweepInterval);

                try
                {
                    while (await queue.Reader.WaitToReadAsync(timeout.Token))
                    {
                        while (queue.Reader.TryRead(out var notificationId))
                        {
                            await DeliverAsync(notificationId, stoppingToken);
                        }
                    }
                }
                catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
                {
                    // Sweep interval elapsed.
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Notification dispatcher loop failed, retrying shortly");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task SweepAsync(CancellationToken cancellationToken)
    {
        List<int> pendingIds;
        using (var scope = scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            if (!await db.Database.CanConnectAsync(cancellationToken))
            {
                return;
            }

            pendingIds = await db.Notifications
                .Where(n => n.EmailStatus == EmailStatuses.Pending)
                .OrderBy(n => n.Id)
                .Select(n => n.Id)
                .Take(100)
                .ToListAsync(cancellationToken);
        }

        foreach (var id in pendingIds)
        {
            await DeliverAsync(id, cancellationToken);
        }
    }

    private async Task DeliverAsync(int notificationId, CancellationToken cancellationToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var delivery = scope.ServiceProvider.GetRequiredService<NotificationDeliveryService>();
            await delivery.DeliverAsync(notificationId, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Could not process notification {NotificationId}", notificationId);
        }
    }
}
