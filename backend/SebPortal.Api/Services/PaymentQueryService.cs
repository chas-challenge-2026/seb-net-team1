using System.Globalization;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class PaymentQueryService(
    PaymentQueryRepository paymentRepository,
    AuditRepository auditRepository,
    RecipientRepository recipientRepository)
{
    public async Task<PaymentDetailsDto?> GetPaymentAsync(int paymentId, int tenantId)
    {
        var payment = await paymentRepository.GetPaymentAsync(paymentId, tenantId);
        if (payment is null)
        {
            return null;
        }

        var auditEntries = await auditRepository.GetPaymentEntriesAsync(paymentId, tenantId);
        var recipientName = await recipientRepository.GetNameByIbanAsync(tenantId, payment.ToIban);

        return new PaymentDetailsDto
        {
            Id = payment.Id,
            FromAccountId = payment.FromAccountId,
            FromAccountName = payment.FromAccount?.AccountName,
            CreatedByName = payment.CreatedBy?.Name,
            ToIban = payment.ToIban,
            RecipientName = recipientName,
            Amount = payment.Amount.ToString("F2", CultureInfo.InvariantCulture),
            Currency = payment.Currency,
            Reference = payment.Reference,
            Status = payment.Status,
            CreatedAt = DateTime.SpecifyKind(payment.CreatedAt, DateTimeKind.Utc),
            ExecutedAt = payment.ExecutedAt is null
                ? null
                : DateTime.SpecifyKind(payment.ExecutedAt.Value, DateTimeKind.Utc),
            ApprovalTimeline = payment.ApprovalSteps
                .OrderBy(step => step.StepNumber)
                .Select(step => new ApprovalTimelineStepDto
                {
                    ApprovalStepId = step.PublicId,
                    StepNumber = step.StepNumber,
                    Status = step.Status,
                    AttestantName = step.Attestant?.Name,
                    DecidedByName = step.DecidedBy?.Name,
                    DecidedAt = step.DecidedAt is null
                        ? null
                        : DateTime.SpecifyKind(step.DecidedAt.Value, DateTimeKind.Utc),
                    Comment = step.Comment,
                    DecisionSource = step.DecisionSource
                }).ToList(),
            Activity = auditEntries.Select(entry => new AuditEntryDto
            {
                Id = entry.Id,
                Action = entry.Action,
                EntityType = entry.EntityType,
                EntityId = entry.EntityId,
                Description = entry.Description ?? string.Empty,
                CreatedAt = DateTime.SpecifyKind(entry.CreatedAt, DateTimeKind.Utc),
                UserName = entry.User?.Name ?? "Systemet",
                IpAddress = entry.IpAddress
            }).ToList()
        };
    }

}
