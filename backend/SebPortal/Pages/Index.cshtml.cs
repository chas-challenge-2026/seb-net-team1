using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Npgsql;
using System.Security.Cryptography;
using System.Text;

namespace SebPortal.Pages;

public class IndexModel : PageModel
{
    // SPAGHETTI: connection string fallback hardcoded in code — should never be in source
    private readonly string _connStr;
    private readonly IConfiguration _config;

    public string? ErrorMessage { get; set; }
    public string? Email { get; set; }

    public IndexModel(IConfiguration config)
    {
        _config = config;
        // SPAGHETTI: Falls back to hardcoded credentials if config missing
        _connStr = config.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=seb;Username=seb;Password=seb123";
    }

    public IActionResult OnGet()
    {
        // If already logged in, skip login page
        if (HttpContext.Session.GetString("UserId") != null)
            return RedirectToPage("/Dashboard");
        return Page();
    }

    public IActionResult OnPost(string email, string password)
    {
        Email = email;

        // SPAGHETTI: MD5 password hashing — broken by design
        string passwordHash = ComputeMd5(password);

        // SPAGHETTI: Raw ADO.NET directly in PageModel — no service layer, no repository
        using var conn = new NpgsqlConnection(_connStr);
        try
        {
            conn.Open();

            // SPAGHETTI: String interpolation in SQL — SQL injection vulnerability
            // Should use parameterized queries
            var sql = $"SELECT id, name, role, tenant_id FROM users WHERE email = '{email}' AND password_md5 = '{passwordHash}'";
            using var cmd = new NpgsqlCommand(sql, conn);
            using var reader = cmd.ExecuteReader();

            if (reader.Read())
            {
                var userId = reader.GetInt32(0);
                var name = reader.GetString(1);
                var role = reader.GetString(2);
                var tenantId = reader.GetInt32(3);

                HttpContext.Session.SetString("UserId", userId.ToString());
                HttpContext.Session.SetString("Name", name);
                HttpContext.Session.SetString("Role", role);
                HttpContext.Session.SetString("TenantId", tenantId.ToString());

                return RedirectToPage("/Dashboard");
            }
            else
            {
                ErrorMessage = "Fel e-post eller lösenord.";
                return Page();
            }
        }
        catch (Exception ex)
        {
            // SPAGHETTI: Exposing raw exception message to UI
            ErrorMessage = "Databasfel: " + ex.Message;
            return Page();
        }
    }

    // SPAGHETTI: MD5 helper method right in the PageModel
    private string ComputeMd5(string input)
    {
        using var md5 = MD5.Create();
        byte[] inputBytes = Encoding.UTF8.GetBytes(input);
        byte[] hashBytes = md5.ComputeHash(inputBytes);
        return Convert.ToHexString(hashBytes).ToLower();
    }
}
