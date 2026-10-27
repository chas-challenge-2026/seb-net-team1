using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

/// <summary>
/// Turns a parsed batch file into payments, all or nothing. Every row is checked
/// first and every problem is collected; payments are only created when no row has one.
/// </summary>
public class PaymentBatchService(
    PaymentRepository paymentRepository,
    PaymentService paymentService)
{
    /// <summary>Largest amount the payments.amount column (DECIMAL(15,2)) can hold.</summary>
    public const decimal MaxAmount = 9_999_999_999_999.99m;

    private const string Currency = "SEK";

    /// <summary>
    /// Validates the rows and, when none is invalid, creates all payments in one unit.
    /// </summary>
    public async Task<BatchCreationResult> CreateAsync(
        int tenantId, int userId, IReadOnlyList<BatchPaymentRow> rows)
    {
        var rowErrors = await ValidateAsync(tenantId, rows);

        if (rowErrors.Count > 0)
        {
            return new BatchCreationResult(rowErrors, []);
        }

        var drafts = rows
            .Select(row => new Payment
            {
                FromAccountId = row.FromAccountId,
                ToIban = NormalizeIban(row.ToIban),
                Amount = row.Amount!.Value,
                Currency = Currency,
                Reference = string.IsNullOrWhiteSpace(row.Reference) ? null : row.Reference.Trim()
            })
            .ToList();

        var payments = await paymentService.CreatePaymentsAsync(tenantId, userId, drafts);

        return new BatchCreationResult([], payments);
    }

    /// <summary>
    /// Checks every row without saving anything. Returns one entry per invalid row,
    /// with all of that row's problems joined into one message. Row numbers start at 2
    /// because the header is row 1.
    /// </summary>
    public async Task<List<BatchRowErrorDto>> ValidateAsync(
        int tenantId, IReadOnlyList<BatchPaymentRow> rows)
    {
        var accounts = new Dictionary<int, Account?>();
        var runningBalances = new Dictionary<int, decimal>();
        var rowErrors = new List<BatchRowErrorDto>();

        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var problems = new List<string>();

            var ibanError = GetIbanError(NormalizeIban(row.ToIban));
            if (ibanError is not null)
            {
                problems.Add(ibanError);
            }

            if (row.Amount is null)
            {
                problems.Add("Beloppet är inte ett giltigt belopp.");
            }
            else if (row.Amount <= 0)
            {
                problems.Add("Beloppet måste vara större än 0.");
            }
            else if (row.Amount > MaxAmount)
            {
                problems.Add("Beloppet är för stort.");
            }

            Account? account = null;

            if (row.FromAccountId <= 0)
            {
                problems.Add("Avsändarkonto måste anges.");
            }
            else
            {
                if (!accounts.TryGetValue(row.FromAccountId, out account))
                {
                    // Filters by id AND tenant, so "missing" and "other tenant" give the
                    // same message and nothing leaks across tenants.
                    account = await paymentRepository.GetAccountAsync(row.FromAccountId, tenantId);
                    accounts[row.FromAccountId] = account;
                }

                if (account is null)
                {
                    problems.Add("Kontot hittades inte.");
                }
            }

            // Only a row that is otherwise valid takes money from the running balance,
            // so one bad row doesn't cause misleading balance errors further down.
            if (problems.Count == 0 && account is not null && row.Amount.HasValue
                && !paymentService.RequiresApproval(row.Amount.Value))
            {
                var amount = row.Amount.Value;
                var balance = runningBalances.GetValueOrDefault(account.Id, account.Balance);

                if (balance < amount)
                {
                    problems.Add("Kontot har inte tillräckligt saldo.");
                }
                else
                {
                    runningBalances[account.Id] = balance - amount;
                }
            }

            if (problems.Count > 0)
            {
                rowErrors.Add(new BatchRowErrorDto
                {
                    RowNumber = index + 2,
                    Content = row.Content,
                    Error = string.Join(" ", problems)
                });
            }
        }

        return rowErrors;
    }

    /// <summary>
    /// Validates an IBAN with libiban (length per country, characters and MOD97).
    /// Virtual so tests can replace it, the native library only exists in the Docker
    /// build. See docs/native-iban-usage.md.
    /// </summary>
    /// <param name="iban">IBAN without spaces, in upper case.</param>
    /// <returns>A user-facing message when the IBAN is invalid, otherwise null.</returns>
    protected virtual string? GetIbanError(string iban)
    {
        if (NativeProvider.IBAN.validate_iban(iban, out var errorCode) == 1)
        {
            return null;
        }

        return errorCode switch
        {
            0 => "IBAN måste anges.",
            1 => "IBAN har fel längd för landet.",
            2 => "IBAN har en okänd landskod.",
            3 => "IBAN innehåller ogiltiga tecken.",
            4 => "IBAN:ens kontrollsiffror är ogiltiga.",
            _ => "IBAN är ogiltigt."
        };
    }

    private static string NormalizeIban(string iban) =>
        string.Concat(iban.Where(c => !char.IsWhiteSpace(c))).ToUpperInvariant();
}

/// <summary>
/// Outcome of a batch: either the invalid rows (nothing was created), or the
/// created payments. Never both.
/// </summary>
public sealed record BatchCreationResult(
    IReadOnlyList<BatchRowErrorDto> RowErrors,
    IReadOnlyList<Payment> Payments);
