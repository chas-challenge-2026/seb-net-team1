using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Npgsql;

namespace SebPortal.Pages;

public class AuditLogModel : PageModel
{
    private readonly string _connStr;

    public string? ErrorMessage { get; set; }
    public List<AuditEntryViewModel> Entries { get; set; } = new();

    public AuditLogModel(IConfiguration config)
    {
        // SPAGHETTI: Hardcoded fallback connection string — fifth occurrence
        _connStr = config.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=seb;Username=seb;Password=seb123";
    }

    public IActionResult OnGet()
    {
        if (HttpContext.Session.GetString("UserId") == null)
            return RedirectToPage("/Index");

        var tenantId = HttpContext.Session.GetString("TenantId") ?? "0";

        // SPAGHETTI: Reads from DB only — but audit log is ALSO written to /tmp/audit.log
        // Batch payments, partial approvals — these only exist in the file, never shown here
        // This makes the audit log fundamentally incomplete in the UI

        using var conn = new NpgsqlConnection(_connStr);
        try
        {
            conn.Open();

            // SPAGHETTI: No tenant filtering on audit_entries — shows ALL users' entries
            // audit_entries has user_id but no tenant_id, so we can't filter properly
            // A user from a different tenant could see this data if they guessed the URL
            var sql = "SELECT ae.id, ae.action, ae.entity_type, ae.entity_id, ae.description, ae.created_at, " +
                      "COALESCE(u.name, 'Systemet') as user_name " +
                      "FROM audit_entries ae " +
                      "LEFT JOIN users u ON u.id = ae.user_id " +
                      "ORDER BY ae.created_at DESC LIMIT 200";

            using var cmd = new NpgsqlCommand(sql, conn);
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                Entries.Add(new AuditEntryViewModel
                {
                    Id = reader.GetInt32(0),
                    Action = reader.GetString(1),
                    EntityType = reader.GetString(2),
                    EntityId = reader.IsDBNull(3) ? 0 : reader.GetInt32(3),
                    Description = reader.IsDBNull(4) ? "" : reader.GetString(4),
                    CreatedAt = reader.GetDateTime(5),
                    UserName = reader.GetString(6)
                });
            }
        }
        catch (Exception ex)
        {
            // SPAGHETTI: Raw exception in UI
            ErrorMessage = "Kunde inte hämta loggdata: " + ex.Message;
        }

        return Page();
    }
}

public class AuditEntryViewModel
{
    public int Id { get; set; }
    public string Action { get; set; } = "";
    public string EntityType { get; set; } = "";
    public int EntityId { get; set; }
    public string Description { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public string UserName { get; set; } = "";
}
