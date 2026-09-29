using SebPortal.Api.Auditing;
using SebPortal.Api.Models;
using SebPortal.Api.Services;

namespace SebPortal.Api.Data;

/// <summary>
/// Demo data for an empty database: the tenant from the v1 seed (Malmö Bygg AB) with
/// its users and accounts, plus six months of payment history in every status so the
/// dashboard, reports, approval inbox and audit log have something to show.
/// All IBANs are valid (MOD97); v1's seed data used IBANs with wrong check digits.
/// </summary>
public static class DemoDataSeeder
{
    public const string DemoPassword = "password123";

    private const string Drift = "SE4550000000058398257466";
    private const string Lon = "SE1850000000058398257467";
    private const string Projekt = "SE8850000000058398257468";

    private const string Byggmaterial = "SE3550000000054910000003";
    private const string Hyresvard = "SE0850000000054910000004";
    private const string Maskinuthyrning = "SE7850000000054910000005";
    private const string ItSupport = "SE5150000000054910000006";
    private const string Underentreprenor = "SE6250000000054910000099";
    private const string Forsakring = "SE7450000000054910000077";
    private const string Skatteverket = "SE7280000810340009783242";
    private const string Elbolag = "SE7760000000000091657462";

    private enum Outcome { Direct, Approved, DoubleApproved, Rejected, Pending, PendingSecondStep }

    private sealed record Spec(
        DateTime CreatedAt,
        string AccountIban,
        string ToIban,
        decimal Amount,
        string Reference,
        Outcome Outcome,
        string CreatedBy = "lisa",
        string? FirstAttestant = null,
        string? SecondAttestant = null,
        string? Comment = null,
        string Source = PaymentSources.Manual);

    public static async Task SeedAsync(SebDbContext db, PasswordHasher passwordHasher, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var startOfMonth = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        DateTime MonthsAgo(int months, int day, int hour) => startOfMonth.AddMonths(-months).AddDays(day - 1).AddHours(hour);
        DateTime Ago(TimeSpan span) => now - span;

        var tenant = new Tenant { Name = "Malmö Bygg AB" };
        db.Tenants.Add(tenant);
        await db.SaveChangesAsync(cancellationToken);

        var created = MonthsAgo(7, 1, 8);
        User NewUser(string name, string email, string role) => new()
        {
            TenantId = tenant.Id,
            Name = name,
            Email = email,
            Role = role,
            PasswordHash = passwordHasher.HashPassword(DemoPassword),
            IsActive = true,
            CreatedAt = created
        };

        var users = new Dictionary<string, User>
        {
            ["lisa"] = NewUser("Lisa Persson", "lisa@malmobygg.se", UserRoles.Initiator),
            ["johan"] = NewUser("Johan Berg", "johan@malmobygg.se", UserRoles.Attestant),
            ["sara"] = NewUser("Sara Ek", "sara@malmobygg.se", UserRoles.Admin),
            ["erik"] = NewUser("Erik Lind", "erik@malmobygg.se", UserRoles.Attestant),
        };
        db.Users.AddRange(users.Values);

        var accounts = new Dictionary<string, Account>
        {
            [Drift] = new() { TenantId = tenant.Id, AccountName = "Driftkonto", Iban = Drift, Currency = "SEK" },
            [Lon] = new() { TenantId = tenant.Id, AccountName = "Lönekonto", Iban = Lon, Currency = "SEK" },
            [Projekt] = new() { TenantId = tenant.Id, AccountName = "Projektkonto", Iban = Projekt, Currency = "SEK" },
        };
        db.Accounts.AddRange(accounts.Values);
        await db.SaveChangesAsync(cancellationToken);

        void Deposit(string iban, decimal amount, DateTime date, string description)
        {
            var account = accounts[iban];
            account.Balance += amount;
            account.Transactions.Add(new Transaction
            {
                AccountId = account.Id,
                Amount = amount,
                Date = date,
                Description = description,
                TransactionType = TransactionTypes.Deposit
            });
        }

        Deposit(Drift, 2_600_000m, MonthsAgo(6, 28, 9), "Ingående saldo");
        Deposit(Lon, 1_200_000m, MonthsAgo(6, 28, 9), "Ingående saldo");
        Deposit(Projekt, 900_000m, MonthsAgo(6, 28, 9), "Ingående saldo");
        for (var month = 5; month >= 0; month--)
        {
            var date = MonthsAgo(month, 1, 7);
            if (date < now)
            {
                Deposit(Drift, 185_000m, date, "Kundinbetalningar");
            }
        }

        var specs = new List<Spec>
        {
            new(MonthsAgo(5, 3, 9), Drift, Hyresvard, 42_500m, "Hyra kontor april", Outcome.Direct),
            new(MonthsAgo(5, 8, 10), Drift, Byggmaterial, 18_750m, "Faktura #1001 Byggmaterial", Outcome.Direct),
            new(MonthsAgo(5, 15, 13), Lon, Skatteverket, 186_400m, "Arbetsgivaravgifter mars", Outcome.Approved, FirstAttestant: "johan"),
            new(MonthsAgo(5, 22, 14), Projekt, Maskinuthyrning, 9_800m, "Maskinhyra vecka 16", Outcome.Direct),
            new(MonthsAgo(4, 2, 9), Drift, Hyresvard, 42_500m, "Hyra kontor maj", Outcome.Direct),
            new(MonthsAgo(4, 9, 11), Drift, Underentreprenor, 96_000m, "Underentreprenad etapp 1", Outcome.Approved, FirstAttestant: "erik"),
            new(MonthsAgo(4, 14, 15), Drift, Forsakring, 12_340.50m, "Företagsförsäkring Q2", Outcome.Direct, CreatedBy: "sara"),
            new(MonthsAgo(4, 20, 10), Projekt, Maskinuthyrning, 54_000m, "Maskinhyra maj", Outcome.Rejected,
                FirstAttestant: "johan", Comment: "Fel mottagare, kontakta leverantören."),
            new(MonthsAgo(4, 27, 9), Projekt, Byggmaterial, 27_150m, "Faktura #1017 Byggmaterial", Outcome.Direct),
            new(MonthsAgo(3, 3, 9), Drift, Hyresvard, 42_500m, "Hyra kontor juni", Outcome.Direct),
            new(MonthsAgo(3, 11, 10), Projekt, Underentreprenor, 312_000m, "Entreprenad Lundagatan etapp 1", Outcome.DoubleApproved,
                FirstAttestant: "johan", SecondAttestant: "erik"),
            new(MonthsAgo(3, 16, 13), Drift, ItSupport, 6_990m, "IT-support juni", Outcome.Direct),
            new(MonthsAgo(3, 24, 11), Lon, Skatteverket, 191_250m, "Arbetsgivaravgifter maj", Outcome.Approved, FirstAttestant: "johan"),
            new(MonthsAgo(2, 2, 9), Drift, Hyresvard, 42_500m, "Hyra kontor juli", Outcome.Direct),
            new(MonthsAgo(2, 10, 14), Drift, Elbolag, 23_480m, "Elräkning Q2", Outcome.Direct),
            new(MonthsAgo(2, 18, 10), Drift, Underentreprenor, 128_000m, "Underentreprenad tilläggsarbeten", Outcome.Rejected,
                FirstAttestant: "erik", Comment: "Beloppet stämmer inte med offerten."),
            new(MonthsAgo(2, 25, 15), Projekt, Byggmaterial, 31_720.40m, "Faktura #1033 Byggmaterial", Outcome.Direct),
            new(MonthsAgo(1, 2, 9), Drift, Hyresvard, 42_500m, "Hyra kontor augusti", Outcome.Direct),
            new(MonthsAgo(1, 8, 10), Drift, Maskinuthyrning, 67_500m, "Maskinhyra Q3", Outcome.Approved, FirstAttestant: "johan"),
            new(MonthsAgo(1, 14, 13), Drift, ItSupport, 6_990m, "IT-support augusti", Outcome.Direct),
            new(MonthsAgo(1, 21, 11), Lon, Skatteverket, 188_900m, "Arbetsgivaravgifter juli", Outcome.Approved, FirstAttestant: "erik"),
            new(MonthsAgo(1, 27, 9), Projekt, Byggmaterial, 14_275m, "Faktura #1041 Byggmaterial", Outcome.Direct, Source: PaymentSources.Batch),
            new(MonthsAgo(1, 27, 9).AddSeconds(1), Projekt, Byggmaterial, 8_640m, "Faktura #1042 Byggmaterial", Outcome.Direct, Source: PaymentSources.Batch),
            new(Ago(TimeSpan.FromDays(9)), Drift, Hyresvard, 42_500m, "Hyra kontor september", Outcome.Direct),
            new(Ago(TimeSpan.FromDays(5)), Drift, Byggmaterial, 75_000m, "Faktura #1043 Byggmaterial", Outcome.Pending, FirstAttestant: "johan"),
            new(Ago(TimeSpan.FromDays(3)), Projekt, Maskinuthyrning, 128_500m, "Maskinhyra september", Outcome.Pending, FirstAttestant: "johan"),
            new(Ago(TimeSpan.FromDays(2)), Projekt, Underentreprenor, 245_000m, "Entreprenad Lundagatan etapp 2", Outcome.PendingSecondStep,
                FirstAttestant: "johan", SecondAttestant: "erik"),
            new(Ago(TimeSpan.FromDays(1)), Drift, Forsakring, 62_000m, "Försäkring fordonsflotta", Outcome.Pending, CreatedBy: "sara", FirstAttestant: "johan"),
            new(Ago(TimeSpan.FromHours(3)), Drift, ItSupport, 6_990m, "IT-support september", Outcome.Direct),
        };

        var seeded = new List<(Spec Spec, Payment Payment)>();
        foreach (var spec in specs.Where(s => s.CreatedAt < now).OrderBy(s => s.CreatedAt))
        {
            var account = accounts[spec.AccountIban];
            var payment = new Payment
            {
                TenantId = tenant.Id,
                FromAccountId = account.Id,
                ToIban = spec.ToIban,
                Amount = spec.Amount,
                Currency = "SEK",
                Reference = spec.Reference,
                CreatedById = users[spec.CreatedBy].Id,
                CreatedAt = spec.CreatedAt,
                Status = PaymentStatuses.PendingApproval,
                Source = spec.Source
            };

            var firstDecision = spec.CreatedAt.AddHours(3);
            var secondDecision = spec.CreatedAt.AddHours(26);

            switch (spec.Outcome)
            {
                case Outcome.Direct:
                    Complete(payment, account, spec.CreatedAt);
                    break;
                case Outcome.Approved:
                    payment.ApprovalSteps.Add(Step(1, users[spec.FirstAttestant!], ApprovalStatuses.Approved, firstDecision, "Ser korrekt ut."));
                    Complete(payment, account, firstDecision);
                    break;
                case Outcome.DoubleApproved:
                    payment.ApprovalSteps.Add(Step(1, users[spec.FirstAttestant!], ApprovalStatuses.Approved, firstDecision, "Kontrollerad mot avtal."));
                    payment.ApprovalSteps.Add(Step(2, users[spec.SecondAttestant!], ApprovalStatuses.Approved, secondDecision, null));
                    Complete(payment, account, secondDecision);
                    break;
                case Outcome.Rejected:
                    payment.ApprovalSteps.Add(Step(1, users[spec.FirstAttestant!], ApprovalStatuses.Rejected, firstDecision, spec.Comment));
                    payment.Status = PaymentStatuses.Rejected;
                    break;
                case Outcome.Pending:
                    payment.ApprovalSteps.Add(Step(1, users[spec.FirstAttestant!], ApprovalStatuses.Pending, null, null));
                    break;
                case Outcome.PendingSecondStep:
                    payment.ApprovalSteps.Add(Step(1, users[spec.FirstAttestant!], ApprovalStatuses.Approved, firstDecision, "Etapp 1 är slutbesiktigad."));
                    payment.ApprovalSteps.Add(Step(2, users[spec.SecondAttestant!], ApprovalStatuses.Pending, null, null));
                    break;
            }

            db.Payments.Add(payment);
            seeded.Add((spec, payment));
        }

        await db.SaveChangesAsync(cancellationToken);

        // Audit trail and notifications, now that the payments have ids.
        foreach (var (spec, payment) in seeded)
        {
            var creator = users[spec.CreatedBy];
            var via = spec.Source == PaymentSources.Batch ? " via batchfil" : string.Empty;
            AddAudit(db, tenant.Id, creator.Id, AuditActions.CreatePayment, payment.Id, spec.CreatedAt,
                $"Betalning #{payment.Id} på {Money.Display(payment.Amount)} SEK till {payment.ToIban} skapad{via} och " +
                $"{(spec.Outcome == Outcome.Direct ? "genomförd direkt" : "skickad för attest")}. Referens: {payment.Reference}.");

            foreach (var step in payment.ApprovalSteps.Where(s => s.Status != ApprovalStatuses.Pending).OrderBy(s => s.StepNumber))
            {
                var decidedBy = step.AttestantId!.Value;
                var remaining = payment.ApprovalSteps.Count(s => s.StepNumber > step.StepNumber);
                var isLast = step.StepNumber == payment.ApprovalSteps.Max(s => s.StepNumber);
                var comment = step.Comment is null ? string.Empty : $" Kommentar: {step.Comment}";

                if (step.Status == ApprovalStatuses.Rejected)
                {
                    AddAudit(db, tenant.Id, decidedBy, AuditActions.RejectPayment, payment.Id, step.DecidedAt!.Value,
                        $"Betalning #{payment.Id} avvisad: {Money.Display(payment.Amount)} SEK.{comment}");
                }
                else if (isLast && payment.Status == PaymentStatuses.Completed)
                {
                    AddAudit(db, tenant.Id, decidedBy, AuditActions.ApprovePayment, payment.Id, step.DecidedAt!.Value,
                        $"Betalning #{payment.Id} godkänd och genomförd: {Money.Display(payment.Amount)} SEK till {payment.ToIban}.{comment}");
                }
                else
                {
                    AddAudit(db, tenant.Id, decidedBy, AuditActions.ApprovePaymentStep, payment.Id, step.DecidedAt!.Value,
                        $"Atteststeg {step.StepNumber} godkänt för betalning #{payment.Id} ({Money.Display(payment.Amount)} SEK). " +
                        $"{Math.Max(remaining, 1)} steg kvar.{comment}");
                }
            }

            var recent = spec.CreatedAt > now.AddDays(-40);
            if (payment.Status == PaymentStatuses.PendingApproval)
            {
                var pendingStep = payment.ApprovalSteps.First(s => s.Status == ApprovalStatuses.Pending);
                AddNotification(db, tenant.Id, pendingStep.AttestantId!.Value, NotificationTypes.ApprovalRequested,
                    payment.ApprovalSteps.Count > 1 || payment.Amount > 200_000m
                        ? $"Betalning väntar på din attest (steg {pendingStep.StepNumber} av 2)"
                        : "Betalning väntar på din attest",
                    $"Betalning #{payment.Id} på {Money.Display(payment.Amount)} SEK till {payment.ToIban} ({payment.Reference}) väntar på din attest.",
                    payment.Id, pendingStep.StepNumber == 2 ? now.AddDays(-2).AddHours(3) : payment.CreatedAt, read: false);
            }
            else if (recent && payment.ApprovalSteps.Count > 0)
            {
                var decidedAt = payment.ApprovalSteps.Max(s => s.DecidedAt) ?? payment.CreatedAt;
                if (payment.Status == PaymentStatuses.Completed)
                {
                    AddNotification(db, tenant.Id, creator.Id, NotificationTypes.PaymentCompleted,
                        "Din betalning är godkänd och genomförd",
                        $"Betalning #{payment.Id} på {Money.Display(payment.Amount)} SEK till {payment.ToIban} ({payment.Reference}) har attesterats och genomförts.",
                        payment.Id, decidedAt, read: true);
                }
            }
        }

        var batchPayments = seeded.Where(s => s.Spec.Source == PaymentSources.Batch).Select(s => s.Payment).ToList();
        if (batchPayments.Count > 0)
        {
            AddAudit(db, tenant.Id, users["lisa"].Id, AuditActions.BatchUpload, null, batchPayments[^1].CreatedAt.AddSeconds(1),
                $"Batchfilen \"leverantorsbetalningar-augusti.csv\" importerades: {batchPayments.Count} betalningar på totalt " +
                $"{Money.Display(batchPayments.Sum(p => p.Amount))} SEK ({batchPayments.Count} genomförda direkt, 0 skickade för attest).");
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private static ApprovalStep Step(int number, User attestant, string status, DateTime? decidedAt, string? comment) => new()
    {
        StepNumber = number,
        AttestantId = attestant.Id,
        Status = status,
        DecidedAt = decidedAt,
        Comment = comment
    };

    private static void Complete(Payment payment, Account account, DateTime executedAt)
    {
        account.Balance -= payment.Amount;
        payment.Status = PaymentStatuses.Completed;
        payment.ExecutedAt = executedAt;
        account.Transactions.Add(new Transaction
        {
            AccountId = account.Id,
            Payment = payment,
            Amount = -payment.Amount,
            Date = executedAt,
            Description = payment.Reference,
            TransactionType = TransactionTypes.Payment
        });
    }

    private static void AddAudit(SebDbContext db, int tenantId, int userId, string action, int? paymentId, DateTime at, string description)
    {
        var entry = Audit.Entry(tenantId, userId, action,
            paymentId is null ? AuditEntityTypes.Batch : AuditEntityTypes.Payment, paymentId, description);
        entry.CreatedAt = at;
        db.AuditEntries.Add(entry);
    }

    private static void AddNotification(SebDbContext db, int tenantId, int recipientId, string type, string title,
        string message, int paymentId, DateTime createdAt, bool read) =>
        db.Notifications.Add(new Notification
        {
            TenantId = tenantId,
            RecipientUserId = recipientId,
            Type = type,
            Title = title,
            Message = message,
            PaymentId = paymentId,
            CreatedAt = createdAt,
            ReadAt = read ? createdAt.AddHours(1) : null,
            // Demo notifications are not e-mailed.
            EmailStatus = EmailStatuses.Skipped
        });
}
