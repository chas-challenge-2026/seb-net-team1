using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
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
    /// otherwise 400 Bad Request with a validation message.
    /// </returns>
    [HttpPost]
    public async Task<IActionResult> CreatePayment(CreatePaymentRequestDto request)
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
        if (string.IsNullOrWhiteSpace(request.ToIban))
        {
            return BadRequest(new { message = "Mottagarkonto måste anges." });
        }
        if (request.FromAccountId <= 0)
        {
            return BadRequest(new { message = "Avsändarkonto måste anges." });
        }

        var createdById = userId.Value;
        var currency = "SEK";

        var payment = await paymentService.CreatePaymentAsync(
            tenantId.Value,
            request.FromAccountId,
            request.ToIban,
            request.Amount,
            currency,
            request.Reference,
            createdById);

        var response = new PaymentResponseDto
        {
            Id = payment.Id,
            Status = payment.Status,
            FromAccountId = payment.FromAccountId,
            ToIban = payment.ToIban,
            Amount = payment.Amount,
            Currency = payment.Currency,
            Reference = payment.Reference,
            CreatedAt = payment.CreatedAt
        };

        return Created($"/api/payments/{payment.Id}", response);
    }

    /// <summary>
    /// Creates payments from an uploaded CSV file. The batch is all-or-nothing:
    /// if any row is invalid, nothing is saved.
    /// </summary>
    /// <param name="file">CSV file with the header from_account_id,to_iban,amount,reference.</param>
    /// <returns>
    /// 201 Created with the created payments when every row is valid,
    /// 401 Unauthorized when the token is missing required user information,
    /// otherwise 400 Bad Request with a validation message.
    /// </returns>
    [HttpPost("batch")]
    [RequestSizeLimit(MaxBatchFileBytes)]
    public async Task<IActionResult> CreatePaymentsBatch(IFormFile file)
    {
        var userId = User.GetUserId();
        var tenantId = User.GetTenantId();

        if (userId is null || tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }
        if (file is null || file.Length == 0)
        {
            return BadRequest(new { message = "Ingen fil vald." });
        }
        if (file.Length > MaxBatchFileBytes)
        {
            return BadRequest(new { message = "Filen är för stor." });
        }

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer);
        var content = buffer.ToArray();

        var (rows, parseError) = ParseCsv(content);

        if (rows is null)
        {
            return BadRequest(new { message = parseError });
        }
        if (rows.Count == 0)
        {
            return BadRequest(new { message = "Filen innehåller inga betalningar." });
        }

        

        // TODO: validate each row (IBAN, account ownership, amount) collecting
        // BatchRowErrorDto per row, then create all payments in one transaction through
        // PaymentService and return BatchPaymentsResponseDto.
        return StatusCode(StatusCodes.Status501NotImplemented);
    }

    private sealed record ParsedCsvRow(int FromAccountId, string ToIban, decimal Amount, string Reference);

    /// <summary>
    /// Parses the CSV bytes with libcsvparser and copies the rows into managed objects,
    /// so the native memory is freed before this method returns.
    /// </summary>
    /// <returns>The rows on success, otherwise null rows and the parser's error message.</returns>
    private static unsafe (List<ParsedCsvRow>? Rows, string? Error) ParseCsv(byte[] content)
    {
        var result = NativeProvider.CSV.parse_csv(content, content.Length);

        if (!result.valid)
        {
            // rows is null here, so there is nothing to free.
            return (null, Encoding.UTF8.GetString(result.error, 256).TrimEnd('\0'));
        }

        try
        {
            var rows = new List<ParsedCsvRow>(result.row_count);

            for (var i = 0; i < result.row_count; i++)
            {
                var row = &result.rows[i];

                rows.Add(new ParsedCsvRow(
                    row->from_account_id,
                    Encoding.UTF8.GetString(row->to_iban, 35).TrimEnd('\0'),
                    Math.Round((decimal)row->amount, 2),
                    Encoding.UTF8.GetString(row->reference, 101).TrimEnd('\0')
                ));
            }

            return (rows, null);
        }
        finally
        {
            if (result.rows != null)
            {
                NativeProvider.CSV.free_csv_rows(result.rows);
            }
        }
    }
}
