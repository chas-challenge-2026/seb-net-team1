using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Npgsql;
using System.Net.Mail;

namespace SebPortal.Pages;

// SPAGHETTI: 500+ line PageModel — all business logic inline, no service layer
// Contains approval rules, email notifications, dual audit logging, amount thresholds,
// second attestant logic, status transitions — all jammed into one class
public class ApprovalInboxModel : PageModel
{
    // SPAGHETTI: Threshold hardcoded AGAIN — inconsistent with NewPayment.cs (50000 there)
    // This is intentionally different: "someone changed it here and forgot to update NewPayment"
    private const decimal REQUIRES_APPROVAL_THRESHOLD = 50000m;

    // SPAGHETTI: Second attestant threshold DIFFERENT from NewPayment (500000 there, 200000 here)
    // Business logic is now split across two files with different values — a real refactoring target
    private const decimal REQUIRES_DOUBLE_APPROVAL_THRESHOLD = 200000m;

    // SPAGHETTI: Yet another hardcoded "max payment" rule that exists nowhere else
    private const decimal ABSOLUTE_MAX_SINGLE_PAYMENT = 5000000m;

    private readonly string _connStr;
    private readonly IConfiguration _config;
    private readonly ILogger<ApprovalInboxModel> _logger;

    public string? SuccessMessage { get; set; }
    public string? ErrorMessage { get; set; }

    public List<PendingPaymentViewModel> PendingPayments { get; set; } = new();
    public List<HandledApprovalViewModel> RecentlyHandled { get; set; } = new();

    public ApprovalInboxModel(IConfiguration config, ILogger<ApprovalInboxModel> logger)
    {
        _config = config;
        _logger = logger;
        // SPAGHETTI: Hardcoded fallback connection string (third copy in the codebase)
        _connStr = config.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=seb;Username=seb;Password=seb123";
    }

    public IActionResult OnGet()
    {
        var userId = HttpContext.Session.GetString("UserId");
        if (userId == null)
            return RedirectToPage("/Index");

        // SPAGHETTI: Role check via string comparison — no claims, no policy, no roles system
        var role = HttpContext.Session.GetString("Role") ?? "";
        if (role != "attestant" && role != "admin")
        {
            return RedirectToPage("/Dashboard");
        }

        LoadPendingPayments(userId);
        LoadRecentlyHandled(userId);

        return Page();
    }

    public IActionResult OnPost(int paymentId, int approvalStepId, string action, string? comment)
    {
        var userId = HttpContext.Session.GetString("UserId");
        if (userId == null)
            return RedirectToPage("/Index");

        var role = HttpContext.Session.GetString("Role") ?? "";
        if (role != "attestant" && role != "admin")
            return RedirectToPage("/Dashboard");

        var tenantId = HttpContext.Session.GetString("TenantId") ?? "0";
        var userIdInt = int.Parse(userId);

        using var conn = new NpgsqlConnection(_connStr);
        try
        {
            conn.Open();

            // -----------------------------------------------------------------------
            // SPAGHETTI: Load payment details inline — no service, no repository
            // -----------------------------------------------------------------------
            decimal paymentAmount = 0;
            string paymentStatus = "";
            int fromAccountId = 0;
            string toIban = "";
            string paymentReference = "";
            int createdByUserId = 0;
            int paymentTenantId = 0;

            using (var cmd = new NpgsqlCommand(
                $"SELECT amount, status, from_account_id, to_iban, reference, created_by, tenant_id " +
                $"FROM payments WHERE id = {paymentId}",
                conn))
            {
                using var reader = cmd.ExecuteReader();
                if (!reader.Read())
                {
                    ErrorMessage = "Betalningen hittades inte.";
                    LoadPendingPayments(userId);
                    LoadRecentlyHandled(userId);
                    return Page();
                }
                paymentAmount = reader.GetDecimal(0);
                paymentStatus = reader.GetString(1);
                fromAccountId = reader.GetInt32(2);
                toIban = reader.GetString(3);
                paymentReference = reader.IsDBNull(4) ? "" : reader.GetString(4);
                createdByUserId = reader.GetInt32(5);
                paymentTenantId = reader.GetInt32(6);
            }

            // SPAGHETTI: Tenant isolation check — does not prevent cross-tenant if admin
            if (paymentTenantId.ToString() != tenantId && role != "admin")
            {
                ErrorMessage = "Du har inte behörighet till denna betalning.";
                LoadPendingPayments(userId);
                LoadRecentlyHandled(userId);
                return Page();
            }

            // -----------------------------------------------------------------------
            // SPAGHETTI: Business rule checks — all inline, magic numbers everywhere
            // -----------------------------------------------------------------------

            if (paymentStatus != "pending_approval")
            {
                ErrorMessage = $"Betalningen är inte längre under granskning (status: {paymentStatus}).";
                LoadPendingPayments(userId);
                LoadRecentlyHandled(userId);
                return Page();
            }

            // SPAGHETTI: Check if this step belongs to this user
            // But we don't prevent an attestant from approving steps assigned to someone else
            // if they know the approvalStepId — IDOR vulnerability
            int stepAttestantId = 0;
            int stepNumber = 0;
            string stepStatus = "";
            using (var cmd = new NpgsqlCommand(
                $"SELECT attestant_id, step_number, status FROM approval_steps WHERE id = {approvalStepId}",
                conn))
            {
                using var reader = cmd.ExecuteReader();
                if (reader.Read())
                {
                    stepAttestantId = reader.GetInt32(0);
                    stepNumber = reader.GetInt32(1);
                    stepStatus = reader.GetString(2);
                }
            }

            if (stepStatus != "pending")
            {
                ErrorMessage = "Det här atteststeget är redan hanterat.";
                LoadPendingPayments(userId);
                LoadRecentlyHandled(userId);
                return Page();
            }

            // -----------------------------------------------------------------------
            // SPAGHETTI: APPROVAL LOGIC — all inline
            // -----------------------------------------------------------------------

            if (action == "approve")
            {
                // Mark this approval step as approved
                using (var cmd = new NpgsqlCommand(
                    $"UPDATE approval_steps SET status = 'approved', decided_at = NOW(), comment = '{comment?.Replace("'", "''")}' " +
                    $"WHERE id = {approvalStepId}",
                    conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // SPAGHETTI: Check if all steps are now approved
                // We do this by counting remaining pending steps
                int pendingStepsLeft = 0;
                int totalSteps = 0;
                using (var cmd = new NpgsqlCommand(
                    $"SELECT COUNT(*) FROM approval_steps WHERE payment_id = {paymentId} AND status = 'pending'",
                    conn))
                {
                    pendingStepsLeft = (int)(long)cmd.ExecuteScalar()!;
                }
                using (var cmd = new NpgsqlCommand(
                    $"SELECT COUNT(*) FROM approval_steps WHERE payment_id = {paymentId}",
                    conn))
                {
                    totalSteps = (int)(long)cmd.ExecuteScalar()!;
                }

                // SPAGHETTI: Threshold check AGAIN — this time using REQUIRES_DOUBLE_APPROVAL_THRESHOLD (200000)
                // which is different from NewPayment.cs DOUBLE_APPROVAL_THRESHOLD (500000)
                // A payment of 300000 SEK gets one step created (by NewPayment), but ApprovalInbox
                // thinks it needs two — so it will never be "fully approved"
                if (paymentAmount > REQUIRES_DOUBLE_APPROVAL_THRESHOLD && totalSteps < 2)
                {
                    // SPAGHETTI: Try to add a second approval step retroactively
                    // Find another attestant — or reuse the same one if no other exists
                    int secondAttestantId = 0;
                    using (var cmd = new NpgsqlCommand(
                        $"SELECT id FROM users WHERE tenant_id = {tenantId} AND role = 'attestant' " +
                        $"AND id != {userIdInt} LIMIT 1",
                        conn))
                    {
                        var result = cmd.ExecuteScalar();
                        secondAttestantId = result != null ? (int)result : userIdInt; // reuse self if no other
                    }

                    using (var cmd = new NpgsqlCommand(
                        $"INSERT INTO approval_steps (payment_id, attestant_id, step_number, status) " +
                        $"VALUES ({paymentId}, {secondAttestantId}, 2, 'pending') " +
                        $"ON CONFLICT DO NOTHING",
                        conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // Recalculate
                    using (var cmd = new NpgsqlCommand(
                        $"SELECT COUNT(*) FROM approval_steps WHERE payment_id = {paymentId} AND status = 'pending'",
                        conn))
                    {
                        pendingStepsLeft = (int)(long)cmd.ExecuteScalar()!;
                    }
                }

                if (pendingStepsLeft == 0)
                {
                    // All steps done — mark payment as completed
                    using (var cmd = new NpgsqlCommand(
                        $"UPDATE payments SET status = 'completed', executed_at = NOW() WHERE id = {paymentId}",
                        conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // SPAGHETTI: Audit to DB only for completion (not to file — inconsistency!)
                    using (var cmd = new NpgsqlCommand(
                        $"INSERT INTO audit_entries (user_id, action, entity_type, entity_id, description) " +
                        $"VALUES ({userIdInt}, 'APPROVE_PAYMENT', 'payment', {paymentId}, " +
                        $"'Betalning godkänd och genomförd: {paymentAmount} SEK till {toIban}')",
                        conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // SPAGHETTI: Balance deduction here — but NOT in the NewPayment "completed" path
                    // So direct payments never deduct balance, only attested ones do
                    using (var cmd = new NpgsqlCommand(
                        $"UPDATE accounts SET balance = balance - {paymentAmount} WHERE id = {fromAccountId}",
                        conn))
                    {
                        cmd.ExecuteNonQuery();
                    }

                    // Notify the payment creator that their payment was approved
                    // SPAGHETTI: Another inline email with no retry
                    NotifyPaymentCreator(createdByUserId, paymentId, paymentAmount, "godkänd", conn);

                    SuccessMessage = $"Betalning #{paymentId} godkänd och genomförd!";
                }
                else
                {
                    // More steps needed
                    // SPAGHETTI: Audit only to FILE for intermediate approval — never appears in UI AuditLog
                    System.IO.File.AppendAllText("/tmp/audit.log",
                        $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} | PARTIAL_APPROVE | user={userIdInt} | payment={paymentId} | steps_left={pendingStepsLeft}\n");

                    SuccessMessage = $"Steg {stepNumber} godkänt. {pendingStepsLeft} steg kvar.";
                }
            }
            else if (action == "reject")
            {
                // Mark step as rejected
                using (var cmd = new NpgsqlCommand(
                    $"UPDATE approval_steps SET status = 'rejected', decided_at = NOW(), comment = '{comment?.Replace("'", "''")}' " +
                    $"WHERE id = {approvalStepId}",
                    conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // Mark payment as rejected
                using (var cmd = new NpgsqlCommand(
                    $"UPDATE payments SET status = 'rejected' WHERE id = {paymentId}",
                    conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // Also cancel all other pending steps for this payment
                using (var cmd = new NpgsqlCommand(
                    $"UPDATE approval_steps SET status = 'rejected', decided_at = NOW() " +
                    $"WHERE payment_id = {paymentId} AND status = 'pending' AND id != {approvalStepId}",
                    conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // SPAGHETTI: Audit rejection to BOTH file AND DB (one of the few cases where both happen)
                System.IO.File.AppendAllText("/tmp/audit.log",
                    $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} | REJECT_PAYMENT | user={userIdInt} | payment={paymentId} | amount={paymentAmount} | comment={comment}\n");

                using (var cmd = new NpgsqlCommand(
                    $"INSERT INTO audit_entries (user_id, action, entity_type, entity_id, description) " +
                    $"VALUES ({userIdInt}, 'REJECT_PAYMENT', 'payment', {paymentId}, " +
                    $"'Betalning avvisad: {paymentAmount} SEK. Kommentar: {comment?.Replace("'", "''")}')",
                    conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // Notify creator of rejection
                NotifyPaymentCreator(createdByUserId, paymentId, paymentAmount, "avvisad", conn);

                SuccessMessage = $"Betalning #{paymentId} avvisad.";
            }
            else
            {
                ErrorMessage = "Okänd åtgärd.";
            }
        }
        catch (Exception ex)
        {
            // SPAGHETTI: Raw exception to UI, no structured logging
            ErrorMessage = "Fel vid attest: " + ex.Message;
            _logger.LogError(ex, "Error in ApprovalInbox.OnPost paymentId={PaymentId}", paymentId);
        }

        // SPAGHETTI: Reload everything after post instead of redirect-after-post
        LoadPendingPayments(userId);
        LoadRecentlyHandled(userId);
        return Page();
    }

    // SPAGHETTI: Yet another inline email method — copy-paste of SendNotification in NewPayment
    // No shared helper, no email service, no template engine
    private void NotifyPaymentCreator(int createdByUserId, int paymentId, decimal amount, string outcome, NpgsqlConnection conn)
    {
        try
        {
            string email = "";
            string name = "";
            using (var cmd = new NpgsqlCommand(
                $"SELECT email, name FROM users WHERE id = {createdByUserId}", conn))
            {
                using var reader = cmd.ExecuteReader();
                if (reader.Read())
                {
                    email = reader.GetString(0);
                    name = reader.GetString(1);
                }
            }

            if (string.IsNullOrEmpty(email)) return;

            var smtpHost = _config["SmtpHost"] ?? "localhost";

#pragma warning disable SYSLIB0006
            using var client = new SmtpClient(smtpHost);
#pragma warning restore SYSLIB0006
            var message = new MailMessage(
                "noreply@seb-portal.local",
                email,
                $"Din betalning #{paymentId} har {outcome}",
                $"Hej {name},\n\nDin betalning #{paymentId} på {amount:N2} SEK har {outcome}.\n\nMvh,\nSEB Företagsbetalningar"
            );
            client.Send(message);
        }
        catch
        {
            // SPAGHETTI: Silently swallowed — notification failure is invisible
        }
    }

    // SPAGHETTI: Load methods are 50+ lines each, still in the same class
    private void LoadPendingPayments(string userId)
    {
        var tenantId = HttpContext.Session.GetString("TenantId") ?? "0";
        var role = HttpContext.Session.GetString("Role") ?? "";

        using var conn = new NpgsqlConnection(_connStr);
        try
        {
            conn.Open();

            // SPAGHETTI: Admin sees all pending, attestant only sees their own
            // But this logic is duplicated in the view (role check for badge display)
            string sql;
            if (role == "admin")
            {
                // Admin sees everything in their tenant
                sql = $"SELECT p.id, p.to_iban, p.amount, p.currency, p.reference, p.created_at, " +
                      $"u.name as created_by_name, a.account_name, " +
                      $"aps.id as step_id, aps.step_number, " +
                      $"(SELECT COUNT(*) FROM approval_steps aps2 WHERE aps2.payment_id = p.id) as total_steps " +
                      $"FROM payments p " +
                      $"INNER JOIN approval_steps aps ON aps.payment_id = p.id AND aps.status = 'pending' " +
                      $"LEFT JOIN users u ON u.id = p.created_by " +
                      $"LEFT JOIN accounts a ON a.id = p.from_account_id " +
                      $"WHERE p.tenant_id = {tenantId} AND p.status = 'pending_approval' " +
                      $"ORDER BY p.created_at ASC";
            }
            else
            {
                // Attestant only sees steps assigned to them
                sql = $"SELECT p.id, p.to_iban, p.amount, p.currency, p.reference, p.created_at, " +
                      $"u.name as created_by_name, a.account_name, " +
                      $"aps.id as step_id, aps.step_number, " +
                      $"(SELECT COUNT(*) FROM approval_steps aps2 WHERE aps2.payment_id = p.id) as total_steps " +
                      $"FROM payments p " +
                      $"INNER JOIN approval_steps aps ON aps.payment_id = p.id AND aps.attestant_id = {userId} AND aps.status = 'pending' " +
                      $"LEFT JOIN users u ON u.id = p.created_by " +
                      $"LEFT JOIN accounts a ON a.id = p.from_account_id " +
                      $"WHERE p.status = 'pending_approval' " +
                      $"ORDER BY p.created_at ASC";
            }

            using var cmd = new NpgsqlCommand(sql, conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                PendingPayments.Add(new PendingPaymentViewModel
                {
                    Id = reader.GetInt32(0),
                    ToIban = reader.GetString(1),
                    Amount = reader.GetDecimal(2),
                    Currency = reader.GetString(3),
                    Reference = reader.IsDBNull(4) ? "" : reader.GetString(4),
                    CreatedAt = reader.GetDateTime(5),
                    CreatedByName = reader.IsDBNull(6) ? "Okänd" : reader.GetString(6),
                    FromAccountName = reader.IsDBNull(7) ? "Okänt konto" : reader.GetString(7),
                    ApprovalStepId = reader.GetInt32(8),
                    CurrentStep = reader.GetInt32(9),
                    TotalSteps = (int)(long)reader.GetValue(10)
                });
            }
        }
        catch (Exception ex)
        {
            // SPAGHETTI: Silently fail — PendingPayments stays empty, no feedback
            _logger.LogError(ex, "Failed to load pending payments");
        }
    }

    private void LoadRecentlyHandled(string userId)
    {
        using var conn = new NpgsqlConnection(_connStr);
        try
        {
            conn.Open();

            // SPAGHETTI: No pagination — "recently" means last 50, no UI feedback about this limit
            var sql = $"SELECT aps.payment_id, p.amount, aps.status, aps.decided_at, aps.comment " +
                      $"FROM approval_steps aps " +
                      $"INNER JOIN payments p ON p.id = aps.payment_id " +
                      $"WHERE aps.attestant_id = {userId} AND aps.status != 'pending' " +
                      $"ORDER BY aps.decided_at DESC LIMIT 50";

            using var cmd = new NpgsqlCommand(sql, conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                RecentlyHandled.Add(new HandledApprovalViewModel
                {
                    PaymentId = reader.GetInt32(0),
                    Amount = reader.GetDecimal(1),
                    Status = reader.GetString(2),
                    DecidedAt = reader.IsDBNull(3) ? null : reader.GetDateTime(3),
                    Comment = reader.IsDBNull(4) ? "" : reader.GetString(4)
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load recently handled approvals");
        }
    }
}

// SPAGHETTI: All view models at bottom of the same 500+ line file
public class PendingPaymentViewModel
{
    public int Id { get; set; }
    public string ToIban { get; set; } = "";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "SEK";
    public string Reference { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public string CreatedByName { get; set; } = "";
    public string FromAccountName { get; set; } = "";
    public int ApprovalStepId { get; set; }
    public int CurrentStep { get; set; }
    public int TotalSteps { get; set; }
}

public class HandledApprovalViewModel
{
    public int PaymentId { get; set; }
    public decimal Amount { get; set; }
    public string Status { get; set; } = "";
    public DateTime? DecidedAt { get; set; }
    public string Comment { get; set; } = "";
}
