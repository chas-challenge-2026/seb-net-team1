using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Npgsql;
using System.Net.Mail;
using System.Text.RegularExpressions;

namespace SebPortal.Pages;

public class NewPaymentModel : PageModel
{
    // SPAGHETTI: Approval threshold duplicated here AND in appsettings.json — they can drift
    // appsettings has 50000, this constant is "the real one" per the dev who wrote it
    private const decimal APPROVAL_THRESHOLD = 50000m;
    // SPAGHETTI: Second threshold inconsistently defined — ApprovalInbox uses 200000 for "attestant2"
    private const decimal DOUBLE_APPROVAL_THRESHOLD = 500000m;

    private readonly string _connStr;
    private readonly IConfiguration _config;

    public string? ErrorMessage { get; set; }
    public string? SuccessMessage { get; set; }
    public string? ToIban { get; set; }
    public string? Reference { get; set; }
    public decimal Amount { get; set; }
    public List<AccountViewModel> Accounts { get; set; } = new();

    public NewPaymentModel(IConfiguration config)
    {
        _config = config;
        // SPAGHETTI: Hardcoded fallback
        _connStr = config.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=seb;Username=seb;Password=seb123";
    }

    public IActionResult OnGet()
    {
        if (HttpContext.Session.GetString("UserId") == null)
            return RedirectToPage("/Index");

        LoadAccounts();
        return Page();
    }

    public IActionResult OnPost(int fromAccountId, string toIban, decimal amount, string reference)
    {
        if (HttpContext.Session.GetString("UserId") == null)
            return RedirectToPage("/Index");

        ToIban = toIban;
        Amount = amount;
        Reference = reference;
        LoadAccounts();

        // SPAGHETTI: IBAN validation with wrong regex — misses MOD97 checksum entirely
        // SE IBANs are 24 chars but this accepts 11-32 alphanumeric after 4-char prefix
        var ibanPattern = new Regex(@"^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$");
        // Strip spaces before validating — but we also forget to strip them before saving
        var ibanStripped = toIban?.Replace(" ", "") ?? "";
        if (!ibanPattern.IsMatch(ibanStripped))
        {
            ErrorMessage = "Ogiltigt IBAN-format. Kontrollera att du angett rätt format.";
            return Page();
        }

        if (amount <= 0)
        {
            ErrorMessage = "Beloppet måste vara större än 0.";
            return Page();
        }

        var userId = int.Parse(HttpContext.Session.GetString("UserId")!);
        var tenantId = int.Parse(HttpContext.Session.GetString("TenantId") ?? "0");

        using var conn = new NpgsqlConnection(_connStr);
        try
        {
            conn.Open();

            // Verify account belongs to this tenant — SPAGHETTI: no proper ownership check
            int accountTenantId = 0;
            using (var cmd = new NpgsqlCommand(
                $"SELECT tenant_id FROM accounts WHERE id = {fromAccountId}", conn))
            {
                var result = cmd.ExecuteScalar();
                accountTenantId = result != null ? (int)result : -1;
            }

            // SPAGHETTI: This check is bypassable — tenant_id comparison is the only guard
            if (accountTenantId != tenantId)
            {
                ErrorMessage = "Du har inte behörighet till det kontot.";
                return Page();
            }

            string status;
            if (amount > APPROVAL_THRESHOLD)
            {
                status = "pending_approval";
            }
            else
            {
                // SPAGHETTI: Immediate "completion" with no actual funds check
                status = "completed";
            }

            // SPAGHETTI: Raw SQL insert, no ORM, no transaction around the whole flow
            int paymentId;
            using (var cmd = new NpgsqlCommand(
                $"INSERT INTO payments (tenant_id, from_account_id, to_iban, amount, currency, reference, status, created_by, created_at) " +
                $"VALUES ({tenantId}, {fromAccountId}, '{ibanStripped}', {amount}, 'SEK', '{reference}', '{status}', {userId}, NOW()) " +
                $"RETURNING id",
                conn))
            {
                paymentId = (int)cmd.ExecuteScalar()!;
            }

            // Write audit entry to DB
            using (var cmd = new NpgsqlCommand(
                $"INSERT INTO audit_entries (user_id, action, entity_type, entity_id, description) " +
                $"VALUES ({userId}, 'CREATE_PAYMENT', 'payment', {paymentId}, " +
                $"'Skapade betalning {amount} SEK till {ibanStripped}')",
                conn))
            {
                cmd.ExecuteNonQuery();
            }

            // SPAGHETTI: ALSO write to file — dual audit log, already diverges
            System.IO.File.AppendAllText("/tmp/audit.log",
                $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} | CREATE_PAYMENT | user={userId} | payment={paymentId} | amount={amount} | to={ibanStripped}\n");

            if (status == "pending_approval")
            {
                // Find an attestant for this tenant — SPAGHETTI: just grabs the first one
                int attestantId = 0;
                using (var cmd = new NpgsqlCommand(
                    $"SELECT id FROM users WHERE tenant_id = {tenantId} AND role = 'attestant' LIMIT 1",
                    conn))
                {
                    var result = cmd.ExecuteScalar();
                    attestantId = result != null ? (int)result : 0;
                }

                if (attestantId > 0)
                {
                    // Create approval step
                    using var cmd = new NpgsqlCommand(
                        $"INSERT INTO approval_steps (payment_id, attestant_id, step_number, status) " +
                        $"VALUES ({paymentId}, {attestantId}, 1, 'pending')",
                        conn);
                    cmd.ExecuteNonQuery();

                    // SPAGHETTI: If amount requires double approval, add second step
                    // But we check > DOUBLE_APPROVAL_THRESHOLD here (500000),
                    // while ApprovalInbox checks > 200000 — INCONSISTENCY
                    if (amount > DOUBLE_APPROVAL_THRESHOLD)
                    {
                        // SPAGHETTI: Grab SAME attestant as step 2 if no second one
                        using var cmd2 = new NpgsqlCommand(
                            $"INSERT INTO approval_steps (payment_id, attestant_id, step_number, status) " +
                            $"VALUES ({paymentId}, {attestantId}, 2, 'pending')",
                            conn);
                        cmd2.ExecuteNonQuery();
                    }

                    // SPAGHETTI: Send notification inline — no queue, no retry
                    SendNotification(attestantId, paymentId, amount, conn);
                }

                SuccessMessage = $"Betalning {paymentId} skapad och skickad för attest (belopp: {amount:N2} SEK).";
            }
            else
            {
                // SPAGHETTI: Balance not actually deducted — this is a bug
                SuccessMessage = $"Betalning {paymentId} genomförd ({amount:N2} SEK).";
            }
        }
        catch (Exception ex)
        {
            // SPAGHETTI: Raw exception to UI
            ErrorMessage = "Fel vid skapande av betalning: " + ex.Message;
        }

        return Page();
    }

    // SPAGHETTI: Notification logic embedded directly in PageModel
    // Uses deprecated System.Net.Mail.SmtpClient
    // No retry, silently swallows all exceptions
    private void SendNotification(int attestantId, int paymentId, decimal amount, NpgsqlConnection conn)
    {
        try
        {
            // Fetch attestant email — yet another DB query inline
            string attestantEmail = "";
            string attestantName = "";
            using (var cmd = new NpgsqlCommand(
                $"SELECT email, name FROM users WHERE id = {attestantId}", conn))
            {
                using var reader = cmd.ExecuteReader();
                if (reader.Read())
                {
                    attestantEmail = reader.GetString(0);
                    attestantName = reader.GetString(1);
                }
            }

            var smtpHost = _config["SmtpHost"] ?? "localhost";

            // SPAGHETTI: SmtpClient is deprecated since .NET 5
            // No TLS config, no auth, no port config, no timeout
#pragma warning disable SYSLIB0006
            using var client = new SmtpClient(smtpHost);
#pragma warning restore SYSLIB0006
            var message = new MailMessage(
                "noreply@seb-portal.local",
                attestantEmail,
                $"Betalning kräver attest — {amount:N2} SEK",
                $"Hej {attestantName},\n\nBetalning #{paymentId} på {amount:N2} SEK kräver din attest.\n\nLogga in på portalen för att granska.\n\nMvh,\nSEB Företagsbetalningar"
            );
            client.Send(message);
        }
        catch
        {
            // SPAGHETTI: Silently swallows ALL exceptions — failed notifications are invisible
            // No logging, no alerting, no retry queue
        }
    }

    private void LoadAccounts()
    {
        var tenantId = HttpContext.Session.GetString("TenantId") ?? "0";
        using var conn = new NpgsqlConnection(_connStr);
        try
        {
            conn.Open();
            using var cmd = new NpgsqlCommand(
                $"SELECT id, account_name, iban, balance, currency FROM accounts WHERE tenant_id = {tenantId} ORDER BY id",
                conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                Accounts.Add(new AccountViewModel
                {
                    Id = reader.GetInt32(0),
                    AccountName = reader.GetString(1),
                    Iban = reader.GetString(2),
                    Balance = reader.GetDecimal(3),
                    Currency = reader.GetString(4)
                });
            }
        }
        catch
        {
            // SPAGHETTI: Swallow silently — accounts list just stays empty
        }
    }
}
