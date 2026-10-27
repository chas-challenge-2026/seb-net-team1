using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Services;

public static class PaymentsMapper
{
    /// <summary>The POST /api/payments response shape from contracts/payments-contract.md.</summary>
    public static PaymentResponseDto ToResponse(Payment payment) => new()
    {
        Id = payment.Id,
        Status = payment.Status,
        FromAccountId = payment.FromAccountId,
        ToIban = payment.ToIban,
        Amount = Money.Format(payment.Amount),
        Currency = payment.Currency,
        Reference = payment.Reference,
        CreatedAt = payment.CreatedAt
    };
}
