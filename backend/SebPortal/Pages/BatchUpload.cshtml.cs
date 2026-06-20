using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Npgsql;
using System.Text.RegularExpressions;

namespace SebPortal.Pages;

public class BatchUploadModel : PageModel
{
    // SPAGHETTI: Approval threshold yet again — fourth copy, same magic number 50000
    private const decimal APPROVAL_THRESHOLD = 50000m;

    private readonly string _connStr;

    public string? ResultMessage { get; set; }
    public bool HasErrors { get; set; }
    public List<string> Errors { get; set; } = new();
    public List<BatchRowResult> ProcessedRows { get; set; } = new();

    public BatchUploadModel(IConfiguration config)
    {
        // SPAGHETTI: Hardcoded fallback connection string — fourth occurrence in the project
        _connStr = config.GetConnectionString("DefaultConnection")
            ?? "Host=localhost;Port=5432;Database=seb;Username=seb;Password=seb123";
    }

    public IActionResult OnGet()
    {
        if (HttpContext.Session.GetString("UserId") == null)
            return RedirectToPage("/Index");
        return Page();
    }

    public async Task<IActionResult> OnPostAsync(IFormFile csvFile)
    {
        if (HttpContext.Session.GetString("UserId") == null)
            return RedirectToPage("/Index");

        var userId = int.Parse(HttpContext.Session.GetString("UserId")!);
        var tenantId = int.Parse(HttpContext.Session.GetString("TenantId") ?? "0");

        if (csvFile == null || csvFile.Length == 0)
        {
            ErrorMessage("Ingen fil vald.");
            return Page();
        }

        // SPAGHETTI: No actual file size limit enforcement (form says 1MB, but code doesn't check)
        // A 100MB file would be accepted and parsed

        string csvContent;
        using (var reader = new StreamReader(csvFile.OpenReadStream()))
        {
            csvContent = await reader.ReadToEndAsync();
        }

        var lines = csvContent.Split('\n', StringSplitOptions.RemoveEmptyEntries);

        if (lines.Length < 2)
        {
            ErrorMessage("CSV-filen är tom eller saknar datarader.");
            return Page();
        }

        // SPAGHETTI: No validation of header row — just skip it and assume columns are correct
        var headerLine = lines[0];
        var dataLines = lines.Skip(1).ToArray();

        int processed = 0;
        int failed = 0;
        int rowNumber = 1;

        // SPAGHETTI: No DB transaction — inserts happen one by one
        // Partial success is possible: rows 1-3 succeed, row 4 fails, rows 5+ succeed
        using var conn = new NpgsqlConnection(_connStr);
        try
        {
            conn.Open();
        }
        catch (Exception ex)
        {
            ErrorMessage("Kunde inte ansluta till databasen: " + ex.Message);
            return Page();
        }

        foreach (var line in dataLines)
        {
            rowNumber++;
            var trimmedLine = line.Trim();
            if (string.IsNullOrEmpty(trimmedLine)) continue;

            // SPAGHETTI: CSV parsing with string.Split — breaks on "Company, Ltd" in reference field
            // No library used, no quoted field handling, no escaped commas
            var parts = trimmedLine.Split(',');

            var rowResult = new BatchRowResult { RowNumber = rowNumber };

            if (parts.Length < 4)
            {
                // SPAGHETTI: Error handling just adds to list and continues — no transaction rollback
                var errMsg = $"Rad {rowNumber}: För få kolumner (förväntade 4, fick {parts.Length})";
                Errors.Add(errMsg);
                rowResult.Error = errMsg;
                rowResult.Success = false;
                ProcessedRows.Add(rowResult);
                failed++;
                continue;
            }

            // SPAGHETTI: No trimming of individual fields — leading/trailing spaces cause parse failures
            var fromAccountIdStr = parts[0];
            var toIban = parts[1];
            var amountStr = parts[2];
            // SPAGHETTI: Reference is assumed to be parts[3] — but "Faktura, #1234" breaks this
            var reference = parts[3];
            // If there are more parts (because reference had a comma), they're silently discarded

            rowResult.ToIban = toIban;
            rowResult.Reference = reference;

            // Parse from_account_id
            if (!int.TryParse(fromAccountIdStr, out int fromAccountId))
            {
                var errMsg = $"Rad {rowNumber}: Ogiltigt konto-ID '{fromAccountIdStr}'";
                Errors.Add(errMsg);
                rowResult.Error = errMsg;
                rowResult.Success = false;
                ProcessedRows.Add(rowResult);
                failed++;
                continue;
            }

            // Parse amount — SPAGHETTI: uses current culture, breaks with Swedish decimal comma
            if (!decimal.TryParse(amountStr, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out decimal amount))
            {
                var errMsg = $"Rad {rowNumber}: Ogiltigt belopp '{amountStr}'";
                Errors.Add(errMsg);
                rowResult.Error = errMsg;
                rowResult.Success = false;
                ProcessedRows.Add(rowResult);
                failed++;
                continue;
            }

            rowResult.Amount = amount;

            // SPAGHETTI: Same wrong IBAN regex as NewPayment — copy-pasted, not shared
            var ibanPattern = new Regex(@"^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$");
            var ibanStripped = toIban.Replace(" ", "").Trim();
            if (!ibanPattern.IsMatch(ibanStripped))
            {
                var errMsg = $"Rad {rowNumber}: Ogiltigt IBAN '{toIban}'";
                Errors.Add(errMsg);
                rowResult.Error = errMsg;
                rowResult.Success = false;
                ProcessedRows.Add(rowResult);
                failed++;
                continue;
            }

            // SPAGHETTI: No ownership check on fromAccountId — any account ID can be used
            // (only tenant check, which is also done sloppily)
            try
            {
                // SPAGHETTI: No transaction — this INSERT can succeed while others fail
                string status = amount > APPROVAL_THRESHOLD ? "pending_approval" : "completed";

                int paymentId;
                using (var cmd = new NpgsqlCommand(
                    $"INSERT INTO payments (tenant_id, from_account_id, to_iban, amount, currency, reference, status, created_by, created_at) " +
                    $"VALUES ({tenantId}, {fromAccountId}, '{ibanStripped}', {amount}, 'SEK', '{reference.Trim().Replace("'", "''")}', '{status}', {userId}, NOW()) " +
                    $"RETURNING id",
                    conn))
                {
                    paymentId = (int)cmd.ExecuteScalar()!;
                }

                // SPAGHETTI: Audit only to FILE for batch — never appears in UI AuditLog page
                System.IO.File.AppendAllText("/tmp/audit.log",
                    $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} | BATCH_PAYMENT | user={userId} | payment={paymentId} | amount={amount} | to={ibanStripped}\n");

                // SPAGHETTI: If approval needed, create step but DO NOT notify attestant
                // Attestant has to discover it in the inbox manually
                if (status == "pending_approval")
                {
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
                        using var cmd = new NpgsqlCommand(
                            $"INSERT INTO approval_steps (payment_id, attestant_id, step_number, status) " +
                            $"VALUES ({paymentId}, {attestantId}, 1, 'pending')",
                            conn);
                        cmd.ExecuteNonQuery();
                    }
                }

                rowResult.Success = true;
                ProcessedRows.Add(rowResult);
                processed++;
            }
            catch (Exception ex)
            {
                // SPAGHETTI: Row-level exception, no rollback of already-inserted rows
                var errMsg = $"Rad {rowNumber}: Databasfel — {ex.Message}";
                Errors.Add(errMsg);
                rowResult.Error = errMsg;
                rowResult.Success = false;
                ProcessedRows.Add(rowResult);
                failed++;
            }
        }

        HasErrors = failed > 0;
        // SPAGHETTI: Reports "X of Y processed" even on partial success
        // User might think all succeeded when half failed
        ResultMessage = $"{processed} av {processed + failed} betalningar behandlade.";
        if (failed > 0)
        {
            ResultMessage += $" {failed} rad(er) misslyckades — se fellistning nedan.";
        }

        return Page();
    }

    private void ErrorMessage(string message)
    {
        ResultMessage = message;
        HasErrors = true;
    }
}

public class BatchRowResult
{
    public int RowNumber { get; set; }
    public string ToIban { get; set; } = "";
    public decimal Amount { get; set; }
    public string Reference { get; set; } = "";
    public bool Success { get; set; }
    public string? Error { get; set; }
}
