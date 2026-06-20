using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Npgsql;

namespace SebPortal.Pages;

// SPAGHETTI: All data access directly in PageModel — no services, no repositories
public class DashboardModel : PageModel
{
    private readonly string _connStr;

    public string UserName { get; set; } = "";
    public string UserRole { get; set; } = "";
    public string TenantName { get; set; } = "";
    public string? ErrorMessage { get; set; }

    public List<AccountViewModel> Accounts { get; set; } = new();
    public List<PaymentViewModel> RecentPayments { get; set; } = new();
    public List<PaymentViewModel> PendingApprovals { get; set; } = new();

    public DashboardModel(IConfiguration config)
    {
        // SPAGHETTI: Hardcoded fallback connection string
        _connStr = config.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=seb;Username=seb;Password=seb123";
    }

    public IActionResult OnGet()
    {
        var userId = HttpContext.Session.GetString("UserId");
        if (userId == null)
            return RedirectToPage("/Index");

        UserName = HttpContext.Session.GetString("Name") ?? "Okänd";
        UserRole = HttpContext.Session.GetString("Role") ?? "";
        var tenantId = HttpContext.Session.GetString("TenantId") ?? "0";

        // SPAGHETTI: Three separate DB round-trips in OnGet, no batching
        using var conn = new NpgsqlConnection(_connStr);
        try
        {
            conn.Open();

            // Query 1: Get tenant name
            // SPAGHETTI: String interpolation instead of parameters
            using (var cmd = new NpgsqlCommand($"SELECT name FROM tenants WHERE id = {tenantId}", conn))
            {
                var result = cmd.ExecuteScalar();
                TenantName = result?.ToString() ?? "Okänt företag";
            }

            // Query 2: Get accounts — SPAGHETTI: no filtering, fetches ALL accounts for tenant
            using (var cmd = new NpgsqlCommand(
                $"SELECT id, account_name, iban, balance, currency FROM accounts WHERE tenant_id = {tenantId} ORDER BY id",
                conn))
            {
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

            // Query 3: Recent payments — SPAGHETTI: no pagination, could return millions of rows
            using (var cmd = new NpgsqlCommand(
                $"SELECT p.id, p.to_iban, p.amount, p.currency, p.reference, p.status, p.created_at " +
                $"FROM payments p WHERE p.tenant_id = {tenantId} " +
                $"ORDER BY p.created_at DESC LIMIT 20",
                conn))
            {
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    RecentPayments.Add(new PaymentViewModel
                    {
                        Id = reader.GetInt32(0),
                        ToIban = reader.GetString(1),
                        Amount = reader.GetDecimal(2),
                        Currency = reader.GetString(3),
                        Reference = reader.IsDBNull(4) ? "" : reader.GetString(4),
                        Status = reader.GetString(5),
                        CreatedAt = reader.GetDateTime(6)
                    });
                }
            }

            // Query 4: Pending approvals for this user (if attestant/admin)
            // SPAGHETTI: Role check via string comparison, no claims/roles system
            if (UserRole == "attestant" || UserRole == "admin")
            {
                using var cmd = new NpgsqlCommand(
                    $"SELECT p.id, p.to_iban, p.amount, p.currency, p.reference, p.status, p.created_at " +
                    $"FROM payments p " +
                    $"INNER JOIN approval_steps aps ON aps.payment_id = p.id " +
                    $"WHERE aps.attestant_id = {userId} AND aps.status = 'pending' " +
                    $"ORDER BY p.created_at ASC",
                    conn);
                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    PendingApprovals.Add(new PaymentViewModel
                    {
                        Id = reader.GetInt32(0),
                        ToIban = reader.GetString(1),
                        Amount = reader.GetDecimal(2),
                        Currency = reader.GetString(3),
                        Reference = reader.IsDBNull(4) ? "" : reader.GetString(4),
                        Status = reader.GetString(5),
                        CreatedAt = reader.GetDateTime(6)
                    });
                }
            }
        }
        catch (Exception ex)
        {
            // SPAGHETTI: Raw exception message in UI
            ErrorMessage = "Kunde inte hämta data: " + ex.Message;
        }

        return Page();
    }
}

// SPAGHETTI: View model classes dumped at the bottom of the same file
public class AccountViewModel
{
    public int Id { get; set; }
    public string AccountName { get; set; } = "";
    public string Iban { get; set; } = "";
    public decimal Balance { get; set; }
    public string Currency { get; set; } = "SEK";
}

public class PaymentViewModel
{
    public int Id { get; set; }
    public string ToIban { get; set; } = "";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "SEK";
    public string Reference { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}
