using System.Globalization;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentsController(PaymentService paymentService) : ControllerBase
{
    /// <summary>
    /// Creates a new payment request from the data sent by the frontend.
    /// The endpoint validates required fields, delegates payment creation to
    /// PaymentService, and returns a response that follows the payment API contract.
    /// </summary>
    /// <param name="request">The payment data sent from the frontend.</param>
    /// <returns>
    /// 201 Created with the created payment data when the request is valid,
    /// otherwise 400 Bad Request with a validation message.
    /// </returns>
    [HttpPost]
    public async Task<IActionResult> CreatePayment(CreatePaymentRequestDto request)
    {
        if (request.Amount <= 0)
        {
            return BadRequest(new { message = "Beloppet måste vara större än 0." });
        }
        if (string.IsNullOrWhiteSpace(request.ToIban))
        {
            return BadRequest(new { message = "Mottagarkonto måste anges." });
        }
        if (request.FromAccountId <= 0)
        {
            return BadRequest(new { message = "Avsändarkonto måste anges." });
        }

        // bör ändras sen men för att se att allt funkar --- är det inget vi vill ha tar vi ba bort raderna
        var tenantId = 1;
        var createdById = 1;
        var requiresApproval = true;
        var currency = "SEK";


        var payment = await paymentService.CreatePaymentAsync(
            tenantId,
            request.FromAccountId,
            request.ToIban,
            request.Amount,
            currency,
            request.Reference,
            createdById,
            requiresApproval);

        var response = new PaymentResponseDto
        {
            Id = payment.Id,
            Status = payment.Status,
            FromAccountId = payment.FromAccountId,
            ToIban = payment.ToIban,
            Amount = payment.Amount.ToString("0.00", CultureInfo.InvariantCulture),
            Currency = payment.Currency,
            Reference = payment.Reference,
            CreatedAt = payment.CreatedAt
        };

        return Created($"/api/payments/{payment.Id}", response);
    }
}
