using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using System.Threading.Tasks;
using System.IO;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class PaymentsController(PaymentService paymentService) : ControllerBase
{
    private const int MaxBatchFileBytes = 1024 * 1024; // 1 MiB

    /// <summary>
    /// Creates a new payment request for an authenticated user.
    /// The endpoint validates required fields, reads user information from the JWT,
    /// delegates payment creation to PaymentService, and returns a response that
    /// follows the payment API contract.
    /// </summary>
    /// <param name="request">The payment data sent from the frontend.</param>
    /// <returns>
    /// 201 Created with the created payment data when the request is valid,
    /// 401 Unauthorized when the token is missing required user information,
    /// 403 Forbidden when the user's role is not initiator or admin,
    /// otherwise 400 Bad Request with a validation message.
    /// </returns>
    [HttpPost]
    [Authorize(Roles = UserRoles.CreatorRoles)]
    public async Task<IActionResult> CreatePayment(
        CreatePaymentRequestDto request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey = null)
    {
        var userId = User.GetUserId();
        var tenantId = User.GetTenantId();

        if (userId is null || tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }
        if (request.Amount <= 0)
        {
            return BadRequest(new { message = "Beloppet måste vara större än 0." });
        }
        if (request.FromAccountId <= 0)
        {
            return BadRequest(new { message = "Avsändarkonto måste anges." });
        }
        if (string.IsNullOrWhiteSpace(request.ToIban))
        {
            return BadRequest(new { message = "Mottagarkonto måste anges." });
        }

        var createdById = userId.Value;
        var currency = "SEK";
        var normalizedToIban = PaymentService.NormalizeIban(request.ToIban ?? string.Empty);

        if (!PaymentService.HasValidIbanFormat(normalizedToIban))
        {
            await paymentService.RecordIbanFormatFailureAsync(tenantId.Value, createdById);
            return BadRequest(new { message = "Ogiltigt IBAN-format. Kontrollera mottagarkontot." });
        }

        var payment = await paymentService.CreatePaymentAsync(
            tenantId.Value,
            request.FromAccountId,
            normalizedToIban,
            request.Amount,
            currency,
            request.Reference,
            createdById,
            idempotencyKey);

        return Created($"/api/payments/{payment.Id}", ToResponse(payment));
    }

    /// <summary>
    /// Creates payments from CSV text sent as the request body (<c>Content-Type: text/csv</c>).
    /// The batch is all-or-nothing: if any row is invalid, nothing is saved.
    /// </summary>
    /// <remarks>
    /// The body is the CSV itself, with the header from_account_id,to_iban,amount,reference.
    /// It is read up to <see cref="MaxBatchFileBytes"/> bytes and never buffered beyond that.
    /// </remarks>
    /// <returns>
    /// 201 Created with <see cref="BatchPaymentsResponseDto"/> when every row is valid,
    /// 401 Unauthorized when the token is missing required user information,
    /// 403 Forbidden when the user's role is not initiator or admin,
    /// 415 Unsupported Media Type when the content type is not text/csv,
    /// 400 Bad Request with <see cref="BatchUnparsedResponseDto"/> when the body could not
    /// be parsed (no row information), or <see cref="BatchInvalidRowsResponseDto"/> when it
    /// parsed but some rows are invalid. Nothing is created in either 400 case.
    /// </returns>
    [HttpPost("batch")]
    [Authorize(Roles = UserRoles.CreatorRoles)]
    [Consumes("text/csv")]
    public async Task<IActionResult> CreatePaymentsBatch(
        [FromServices] PaymentBatchService batchService)
    {
        var userId = User.GetUserId();
        var tenantId = User.GetTenantId();

        if (userId is null || tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }
        if (Request.ContentLength > MaxBatchFileBytes)
        {
            return Unparsed("Filen är för stor.");
        }

        var content = await ReadBodyAsync(MaxBatchFileBytes);

        if (content is null)
        {
            // No Content-Length (chunked body) that turned out too large.
            return Unparsed("Filen är för stor.");
        }
        if (content.Length == 0)
        {
            return Unparsed("Ingen fil vald.");
        }

        var (rows, parseError) = BatchCsvParser.Parse(content);

        if (rows is null)
        {
            return Unparsed(parseError ?? "Filen kunde inte läsas.");
        }
        if (rows.Count == 0)
        {
            return Unparsed("Filen innehåller inga betalningar.");
        }

        // Every row is validated first. Payments are only created when none is invalid,
        // and then all of them are created in one transaction.
        var result = await batchService.CreateAsync(tenantId.Value, userId.Value, rows);

        if (result.RowErrors.Count > 0)
        {
            var invalidRows = result.RowErrors.Count;

            return BadRequest(new BatchInvalidRowsResponseDto
            {
                Message = $"{invalidRows} av {rows.Count} rader är ogiltiga. Inga betalningar skapades.",
                TotalRows = rows.Count,
                InvalidRows = invalidRows,
                Rows = result.RowErrors.ToList()
            });
        }

        var response = new BatchPaymentsResponseDto
        {
            Total = result.Payments.Count,
            Completed = result.Payments.Count(p => p.Status == PaymentStatuses.Completed),
            PendingApproval = result.Payments.Count(p => p.Status == PaymentStatuses.PendingApproval),
            TotalAmount = result.Payments.Sum(p => p.Amount),
            Payments = result.Payments.Select(ToResponse).ToList()
        };

        // A batch has no single resource to point to, so there is no Location header.
        return StatusCode(StatusCodes.Status201Created, response);
    }

    private async Task<byte[]?> ReadBodyAsync(int maxBytes)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[16 * 1024];
        int read;

        while ((read = await Request.Body.ReadAsync(chunk.AsMemory())) > 0)
        {
            if (buffer.Length + read > maxBytes)
            {
                return null;
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    private BadRequestObjectResult Unparsed(string message) =>
        BadRequest(new BatchUnparsedResponseDto { Message = message });

    private static PaymentResponseDto ToResponse(Payment payment) => new()
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
}
