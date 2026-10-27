## Notifications

In-app notifications for the logged-in user (the bell in the top bar). Every notification is also delivered by e-mail in the background. All endpoints require a valid JWT and only touch the caller's own notifications.

### Notification

```json
{
  "id": 17,
  "type": "approval_requested",
  "title": "Betalning väntar på din attest",
  "message": "Betalning #25 på 75 000,00 SEK till SE3550000000054910000003 (Faktura #1043) väntar på din attest.",
  "paymentId": 25,
  "createdAt": "2026-09-24T09:12:00Z",
  "readAt": null
}
```

| `type` | Sent to | When |
|---|---|---|
| `approval_requested` | The assigned attestant (or every eligible admin when the step is unassigned) | A payment step is waiting for their decision |
| `payment_completed` | The payment's creator | The last approval completed the payment |
| `payment_rejected` | The payment's creator | An attestant rejected the payment (includes the comment) |

### GET `/api/notifications?limit=20`

Newest first (`limit` max 50):

```json
{ "items": [ { "...": "Notification" } ], "unreadCount": 3 }
```

### POST `/api/notifications/{id}/read`

Marks one notification as read. `204 No Content`, `404` when it is not the caller's.

### POST `/api/notifications/read-all`

Marks all of the caller's notifications as read. `204 No Content`.

---

## E-mail delivery (backend)

Replaces v1's inline `SmtpClient` calls that swallowed every error (BUG-007).

1. The notification row is saved in the same transaction as the payment or decision that caused it. The row is also the outbox: `email_status` starts as `pending`.
2. After the save, its id is put on an in-process queue (`Channel<int>`). A background worker (`NotificationDispatcher`, an `IHostedService`) sends it with **MailKit**. The worker also sweeps the table every 30 seconds, so nothing is lost if the process restarts.
3. Up to `Smtp:MaxAttempts` (3) attempts with exponential backoff (`Smtp:RetryBaseDelayMilliseconds`, doubled per retry).
4. The outcome is stored on the row: `email_status` = `sent` / `failed` / `skipped` (no SMTP configured), `email_attempts`, `email_last_error`, `email_sent_at`. Failures are also logged as errors (Serilog).

Configuration (`Smtp` section / `Smtp__*` environment variables): `Host`, `Port`, `Security` (`none`, `starttls`, `ssl`, `auto`), `Username`, `Password`, `FromAddress`, `FromName`. Locally the compose override starts **Mailpit**, so e-mails can be read at http://localhost:8025.
