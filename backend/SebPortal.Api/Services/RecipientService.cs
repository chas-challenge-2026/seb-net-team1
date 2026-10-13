using Microsoft.EntityFrameworkCore;
using Npgsql;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class RecipientService(
    RecipientRepository recipientRepository,
    AuditService auditService,
    IHostEnvironment environment,
    IConfiguration configuration)
{
    public bool DemoConfirmationEnabled => environment.IsDevelopment() ||
        configuration.GetValue<bool>("Recipients:AllowDemoConfirmation");

    public async Task<RecipientsResponseDto> GetRecipientsAsync(int tenantId) => new()
    {
        Recipients = (await recipientRepository.GetForTenantAsync(tenantId)).Select(ToDto).ToList(),
        DemoConfirmationEnabled = DemoConfirmationEnabled
    };

    public async Task<RecipientDto> CreateRecipientAsync(
        int tenantId, int userId, string? name, string? iban, bool demoConfirmed)
    {
        if (!DemoConfirmationEnabled)
        {
            throw new RecipientDemoConfirmationDisabledException();
        }

        if (!demoConfirmed)
        {
            throw new RecipientValidationException(
                "Bekräfta mottagaren med den simulerade bekräftelsen innan du sparar.");
        }

        var normalizedName = name?.Trim() ?? string.Empty;
        if (normalizedName.Length is < 1 or > 100)
        {
            throw new RecipientValidationException(
                "Mottagarens namn måste vara mellan 1 och 100 tecken.");
        }

        var normalizedIban = PaymentService.NormalizeIban(iban ?? string.Empty);
        if (!PaymentService.HasValidIbanFormat(normalizedIban))
        {
            throw new RecipientValidationException(
                "Ogiltigt IBAN-format. Kontrollera mottagarkontot.");
        }

        var tenantLock = auditService.GetTenantLock(tenantId);
        await tenantLock.WaitAsync();
        try
        {
            if (await recipientRepository.ExistsAsync(tenantId, normalizedIban))
            {
                throw new DuplicateRecipientException();
            }

            // The generated recipient id is needed by the audit entry. Keep both
            // saves in one transaction so a failed audit never leaves a recipient.
            await using var transaction = await recipientRepository.BeginTransactionAsync();
            var recipient = new Recipient
            {
                TenantId = tenantId,
                Name = normalizedName,
                Iban = normalizedIban,
                CreatedById = userId,
                CreatedAt = DateTime.UtcNow
            };
            await recipientRepository.AddAsync(recipient);
            await auditService.AppendEntryAsync(
                tenantId,
                userId,
                "CREATE_RECIPIENT",
                "recipient",
                recipient.Id,
                $"Mottagare tillagd: {normalizedName} ({normalizedIban}). " +
                "Simulerad bekräftelse för demo; ingen riktig e-legitimering utfördes.");
            await recipientRepository.SaveChangesAsync();
            if (transaction is not null)
            {
                await transaction.CommitAsync();
            }

            return ToDto(recipient);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: RecipientRepository.UniqueIbanIndexName
        })
        {
            // The unique index also protects requests from another API instance.
            // Leave the original recipient untouched and report the conflict.
            recipientRepository.ClearTrackedChanges();
            throw new DuplicateRecipientException();
        }
        finally
        {
            tenantLock.Release();
        }
    }

    private static RecipientDto ToDto(Recipient recipient) => new()
    {
        Id = recipient.Id,
        Name = recipient.Name,
        Iban = recipient.Iban,
        CreatedAt = DateTime.SpecifyKind(recipient.CreatedAt, DateTimeKind.Utc)
    };
}
