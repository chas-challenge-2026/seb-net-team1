using Microsoft.Extensions.Logging.Abstractions;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Notifications;
using SebPortal.Api.Options;

namespace SebPortal.Api.Tests;

/// <summary>
/// E-mail delivery with retries (acceptance criterion: "Notifieringsfel loggas —
/// mock SMTP som kastar, verifiera DB-post"). v1 swallowed every SMTP error in an
/// empty catch block (BUG-007).
/// </summary>
public class NotificationDeliveryServiceTests
{
    private sealed class ThrowingEmailSender : IEmailSender
    {
        public int Calls { get; private set; }

        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
        {
            Calls++;
            throw new InvalidOperationException("SMTP-servern svarar inte");
        }
    }

    private sealed class FlakyEmailSender(int failuresBeforeSuccess) : IEmailSender
    {
        public List<EmailMessage> Sent { get; } = [];
        private int _calls;

        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken)
        {
            if (++_calls <= failuresBeforeSuccess)
            {
                throw new TimeoutException("Timeout");
            }
            Sent.Add(message);
            return Task.CompletedTask;
        }
    }

    private static (SebDbContext Db, int NotificationId) Seed()
    {
        var db = TestServices.CreateContext();
        db.Tenants.Add(new Tenant { Id = 1, Name = "Malmö Bygg AB" });
        db.Users.Add(new User { Id = 2, TenantId = 1, Name = "Johan Berg", Email = "johan@malmobygg.se", Role = UserRoles.Attestant });
        var notification = new Notification
        {
            TenantId = 1,
            RecipientUserId = 2,
            Type = NotificationTypes.ApprovalRequested,
            Title = "Betalning väntar på din attest",
            Message = "Betalning #42 på 75 000,00 SEK väntar på din attest.",
            PaymentId = 42
        };
        db.Notifications.Add(notification);
        db.SaveChanges();
        return (db, notification.Id);
    }

    private static NotificationDeliveryService Service(SebDbContext db, IEmailSender sender, string? smtpHost = "smtp.test") =>
        new(db, sender,
            Microsoft.Extensions.Options.Options.Create(new SmtpOptions { Host = smtpHost, MaxAttempts = 3, RetryBaseDelayMilliseconds = 0 }),
            Microsoft.Extensions.Options.Options.Create(new AppOptions { PublicUrl = "https://portal.test" }),
            NullLogger<NotificationDeliveryService>.Instance);

    [Fact]
    public async Task DeliverAsync_WhenSmtpKeepsFailing_RetriesThreeTimesAndRecordsTheFailure()
    {
        var (db, id) = Seed();
        var sender = new ThrowingEmailSender();

        await Service(db, sender).DeliverAsync(id, CancellationToken.None);

        var notification = db.Notifications.Single();
        Assert.Equal(3, sender.Calls);
        Assert.Equal(EmailStatuses.Failed, notification.EmailStatus);
        Assert.Equal(3, notification.EmailAttempts);
        Assert.Contains("SMTP-servern svarar inte", notification.EmailLastError);
        Assert.Null(notification.EmailSentAt);
    }

    [Fact]
    public async Task DeliverAsync_WhenSmtpRecovers_SendsOnTheRetry()
    {
        var (db, id) = Seed();
        var sender = new FlakyEmailSender(failuresBeforeSuccess: 2);

        await Service(db, sender).DeliverAsync(id, CancellationToken.None);

        var notification = db.Notifications.Single();
        var mail = Assert.Single(sender.Sent);
        Assert.Equal(EmailStatuses.Sent, notification.EmailStatus);
        Assert.Equal(3, notification.EmailAttempts);
        Assert.NotNull(notification.EmailSentAt);
        Assert.Equal("johan@malmobygg.se", mail.ToAddress);
        Assert.Contains("https://portal.test/payments/42", mail.TextBody);
    }

    [Fact]
    public async Task DeliverAsync_WithoutSmtpConfigured_MarksItSkipped()
    {
        var (db, id) = Seed();
        var sender = new ThrowingEmailSender();

        await Service(db, sender, smtpHost: null).DeliverAsync(id, CancellationToken.None);

        Assert.Equal(0, sender.Calls);
        Assert.Equal(EmailStatuses.Skipped, db.Notifications.Single().EmailStatus);
    }

    [Fact]
    public async Task DeliverAsync_DoesNotSendTwice()
    {
        var (db, id) = Seed();
        var sender = new FlakyEmailSender(failuresBeforeSuccess: 0);
        var service = Service(db, sender);

        await service.DeliverAsync(id, CancellationToken.None);
        await service.DeliverAsync(id, CancellationToken.None);

        Assert.Single(sender.Sent);
    }

    [Fact]
    public async Task SavingANotification_PutsItOnTheQueue()
    {
        var queue = new NotificationQueue();
        using var db = TestServices.CreateContext(queue: queue);
        db.Tenants.Add(new Tenant { Id = 1, Name = "Malmö Bygg AB" });
        db.Users.Add(new User { Id = 2, TenantId = 1, Name = "Johan Berg", Email = "johan@malmobygg.se", Role = UserRoles.Attestant });
        await db.SaveChangesAsync();

        new Services.NotificationService(db).Add(1, 2, NotificationTypes.ApprovalRequested, "Titel", "Text", null);
        await db.SaveChangesAsync();

        Assert.True(queue.Reader.TryRead(out var queuedId));
        Assert.Equal(db.Notifications.Single().Id, queuedId);
    }
}
