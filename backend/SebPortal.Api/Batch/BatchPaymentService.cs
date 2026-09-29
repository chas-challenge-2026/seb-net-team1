using Microsoft.Extensions.Options;
using SebPortal.Api.Auditing;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Options;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;

namespace SebPortal.Api.Batch;

/// <summary>
/// CSV batch payments. Every row is validated with the same rules as a single
/// payment (IBAN MOD97, amount, reference, account in tenant, available balance
/// counting the earlier rows of the same file). A file is only accepted when every
/// row is valid, and then all payments are created in one transaction: all or
/// nothing. v1 inserted row by row without a transaction, so a failure on row 3
/// left rows 1-2 committed (BUG-005), and it had no size limit (BUG-012).
/// </summary>
public class BatchPaymentService(
    ICsvPaymentParser csvParser,
    PaymentRepository paymentRepository,
    PaymentService paymentService,
    ApprovalAssignmentService approvalAssignment,
    UnitOfWork unitOfWork,
    IOptions<BatchOptions> batchOptions)
{
    private sealed record ValidatedRow(BatchRowDto Dto, int AccountId, string ToIban, decimal Amount, string? Reference);

    private sealed record Validation(BatchValidationResponse Response, List<ValidatedRow> Rows);

    public async Task<BatchValidationResponse> ValidateAsync(int tenantId, string fileName, byte[] content) =>
        (await ValidateInternalAsync(tenantId, fileName, content)).Response;

    public async Task<BatchResultDto> CreateAsync(int tenantId, int userId, string fileName, byte[] content, string? idempotencyKey)
    {
        var key = string.IsNullOrWhiteSpace(idempotencyKey) ? null : idempotencyKey.Trim();
        if (key is { Length: > PaymentService.MaxIdempotencyKeyLength - 6 })
        {
            throw new IdempotencyKeyTooLongException(PaymentService.MaxIdempotencyKeyLength - 6);
        }

        if (key is not null)
        {
            var previous = await paymentRepository.FindByIdempotencyKeyPrefixAsync(tenantId, userId, key + ":");
            if (previous.Count > 0)
            {
                return ToResult(previous);
            }
        }

        var validation = await ValidateInternalAsync(tenantId, fileName, content);
        if (!validation.Response.IsValid)
        {
            throw new BatchValidationException(validation.Response);
        }

        var payments = await unitOfWork.RunAsync(tenantId, async () =>
        {
            var accountIds = validation.Rows.Select(r => r.AccountId).Distinct().ToList();
            var accounts = (await paymentRepository.GetAccountsAsync(tenantId, accountIds)).ToDictionary(a => a.Id);

            var created = new List<(Payment Payment, ApprovalStep? Step)>();
            foreach (var row in validation.Rows)
            {
                var payment = PaymentService.NewPayment(tenantId, userId, row.AccountId, row.ToIban, row.Amount,
                    row.Reference, key is null ? null : $"{key}:{row.Dto.RowNumber}", PaymentSources.Batch);

                ApprovalStep? step = null;
                if (paymentService.RequiresApproval(row.Amount))
                {
                    step = await approvalAssignment.CreateNextStepAsync(payment, []);
                }
                else
                {
                    paymentService.CompletePaymentOrThrow(payment, accounts[row.AccountId]);
                }

                paymentRepository.AddPayment(payment);
                created.Add((payment, step));
            }

            await paymentRepository.SaveChangesAsync();

            foreach (var (payment, step) in created)
            {
                paymentRepository.AddAuditEntry(PaymentService.CreatedAuditEntry(payment));
                if (step is not null)
                {
                    await approvalAssignment.NotifyAsync(payment, step, [step], paymentService.RequiredApprovalSteps(payment.Amount));
                }
            }

            var total = created.Sum(c => c.Payment.Amount);
            paymentRepository.AddAuditEntry(Audit.Entry(
                tenantId, userId, AuditActions.BatchUpload, AuditEntityTypes.Batch, null,
                $"Batchfilen \"{fileName}\" importerades: {created.Count} betalningar på totalt " +
                $"{Money.Display(total)} SEK ({created.Count(c => c.Step is null)} genomförda direkt, " +
                $"{created.Count(c => c.Step is not null)} skickade för attest). Betalnings-id " +
                $"{created.Min(c => c.Payment.Id)}–{created.Max(c => c.Payment.Id)}."));

            await paymentRepository.SaveChangesAsync();
            return created.Select(c => c.Payment).ToList();
        });

        return ToResult(payments);
    }

    private async Task<Validation> ValidateInternalAsync(int tenantId, string fileName, byte[] content)
    {
        var options = batchOptions.Value;
        var response = new BatchValidationResponse
        {
            FileName = Path.GetFileName(fileName),
            Parser = csvParser.Implementation
        };

        if (content.Length == 0)
        {
            response.FileErrors.Add("Filen är tom.");
            return new Validation(response, []);
        }

        if (content.Length > options.MaxFileSizeBytes)
        {
            response.FileErrors.Add($"Filen är för stor. Max storlek är {options.MaxFileSizeBytes / 1024} kB.");
            return new Validation(response, []);
        }

        var parsed = csvParser.Parse(content, options.MaxRows);
        response.Parser = parsed.Parser;

        if (!parsed.Success)
        {
            response.FileErrors.Add(parsed.Error!);
            return new Validation(response, []);
        }

        var accountIds = parsed.Rows
            .Select(r => int.TryParse(r.FromAccountId.Trim(), out var id) ? id : 0)
            .Where(id => id > 0)
            .Distinct()
            .ToList();

        var accounts = (await paymentRepository.GetAccountsAsync(tenantId, accountIds)).ToDictionary(a => a.Id);
        var available = new Dictionary<int, decimal>();
        foreach (var account in accounts.Values)
        {
            available[account.Id] = account.Balance - await paymentRepository.GetReservedAmountAsync(account.Id);
        }

        var validRows = new List<ValidatedRow>();
        var totalAmount = 0m;

        foreach (var row in parsed.Rows)
        {
            var dto = new BatchRowDto
            {
                RowNumber = row.LineNumber,
                ToIban = row.ToIban.Trim(),
                Reference = row.Reference.Trim()
            };
            response.Rows.Add(dto);

            if (!int.TryParse(row.FromAccountId.Trim(), out var accountId) || accountId <= 0)
            {
                dto.Errors.Add($"Ogiltigt konto-id \"{row.FromAccountId}\".");
            }
            else if (!accounts.TryGetValue(accountId, out var account))
            {
                dto.FromAccountId = accountId;
                dto.Errors.Add($"Konto {accountId} finns inte hos företaget.");
            }
            else
            {
                dto.FromAccountId = accountId;
                dto.FromAccountName = account.AccountName;
            }

            var amountParsed = Money.TryParse(row.Amount, out var amount);
            if (!amountParsed)
            {
                dto.Errors.Add($"Ogiltigt belopp \"{row.Amount}\". Använd till exempel 1250.50.");
            }
            else
            {
                dto.Amount = Money.Format(amount);
            }

            string? toIban = null;
            string? reference = null;
            if (amountParsed)
            {
                try
                {
                    toIban = paymentService.ValidatePaymentInput(row.ToIban, amount, row.Reference, out reference);
                    dto.ToIban = toIban;
                    dto.RequiresApproval = paymentService.RequiresApproval(amount);
                }
                catch (AppException ex)
                {
                    dto.Errors.Add(ex.UserMessage);
                }
            }

            if (dto.Errors.Count == 0 && dto.FromAccountId is { } validAccountId)
            {
                var account = accounts[validAccountId];
                if (account.Iban == toIban)
                {
                    dto.Errors.Add("Mottagarkontot kan inte vara samma som avsändarkontot.");
                }
                else if (amount > available[validAccountId])
                {
                    dto.Errors.Add(
                        $"Otillräckligt tillgängligt saldo på {account.AccountName} " +
                        $"({Money.Display(available[validAccountId])} kr kvar efter tidigare rader).");
                }
                else
                {
                    available[validAccountId] -= amount;
                    totalAmount += amount;
                    validRows.Add(new ValidatedRow(dto, validAccountId, toIban!, amount, reference));
                }
            }
        }

        response.RowCount = response.Rows.Count;
        response.InvalidRowCount = response.Rows.Count(r => r.Errors.Count > 0);
        response.ValidRowCount = response.RowCount - response.InvalidRowCount;
        response.TotalAmount = Money.Format(totalAmount);
        response.ApprovalRequiredCount = validRows.Count(r => r.Dto.RequiresApproval);
        response.DirectPaymentCount = validRows.Count - response.ApprovalRequiredCount;

        return new Validation(response, validRows);
    }

    private static BatchResultDto ToResult(List<Payment> payments) => new()
    {
        CreatedCount = payments.Count,
        CompletedCount = payments.Count(p => p.Status == PaymentStatuses.Completed),
        PendingApprovalCount = payments.Count(p => p.Status == PaymentStatuses.PendingApproval),
        TotalAmount = Money.Format(payments.Sum(p => p.Amount)),
        Payments = payments.Select(PaymentsMapper.ToResponse).ToList()
    };
}
