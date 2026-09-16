using System.Globalization;
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
    public IActionResult CreatePayment(CreatePaymentRequestDto request)
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

        var payment = paymentService.CreatePayment(request);

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
