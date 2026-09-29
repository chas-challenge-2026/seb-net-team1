using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.Batch;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class PaymentsController(
    PaymentService paymentService,
    PaymentQueryService paymentQueryService,
    BatchPaymentService batchPaymentService) : ControllerBase
{
    /// <summary>Upload requests are capped before the body is read; the batch service enforces the 1 MB file rule.</summary>
    private const long MaxUploadRequestBytes = 2 * 1024 * 1024;

    /// <summary>
    /// Creates a new payment request for an authenticated initiator or admin.
    /// Tenant and user come from the JWT, never from the body. Validation, the
    /// approval rules and persistence live in PaymentService; errors are thrown as
    /// custom exceptions and returned as ProblemDetails by AppExceptionHandler.
    /// </summary>
    /// <param name="request">The payment data sent from the frontend.</param>
    /// <param name="idempotencyKey">Optional key; a retry with the same key returns the original payment.</param>
    /// <returns>
    /// 201 Created with the payment, 200 OK for an idempotent replay,
    /// 400 for invalid input or insufficient funds, 403 for attestants, 404 for an unknown account.
    /// </returns>
    [HttpPost]
    [Authorize(Roles = UserRoles.CreatorRoles)]
    public async Task<IActionResult> CreatePayment(
        CreatePaymentRequestDto request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey = null)
    {
        if (User.GetUserId() is not { } userId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        var result = await paymentService.CreatePaymentAsync(new CreatePaymentCommand(
            tenantId,
            userId,
            request.FromAccountId,
            request.ToIban,
            request.Amount,
            request.Reference,
            idempotencyKey));

        var response = PaymentsMapper.ToResponse(result.Payment);

        if (result.Replayed)
        {
            Response.Headers["Idempotent-Replayed"] = "true";
            return Ok(response);
        }

        return Created($"/api/payments/{response.Id}", response);
    }

    /// <summary>Payment history for the caller's tenant, filtered and paged.</summary>
    [HttpGet]
    public async Task<ActionResult<PagedResponse<PaymentListItemDto>>> List([FromQuery] PaymentListQuery query)
    {
        if (User.GetUserId() is not { } userId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await paymentQueryService.ListAsync(tenantId, userId, query));
    }

    /// <summary>One payment with its approval steps and audit trail.</summary>
    [HttpGet("{paymentId:int}")]
    public async Task<ActionResult<PaymentDetailDto>> Get(int paymentId)
    {
        if (User.GetUserId() is not { } userId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await paymentQueryService.GetDetailAsync(tenantId, userId, User.GetRole(), paymentId));
    }

    /// <summary>The same filters as the list, as a CSV file for Excel.</summary>
    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] PaymentListQuery query)
    {
        if (User.GetUserId() is not { } userId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        var csv = await paymentQueryService.ExportCsvAsync(tenantId, userId, query);
        return File(csv, "text/csv; charset=utf-8", $"betalningar-{DateTime.UtcNow:yyyyMMdd}.csv");
    }

    /// <summary>Checks a CSV batch file without creating anything, so the user can review every row first.</summary>
    [HttpPost("batch/validate")]
    [Authorize(Roles = UserRoles.CreatorRoles)]
    [RequestSizeLimit(MaxUploadRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxUploadRequestBytes)]
    public async Task<ActionResult<BatchValidationResponse>> ValidateBatch(IFormFile? file)
    {
        if (User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        var (fileName, content) = await ReadFileAsync(file);
        return Ok(await batchPaymentService.ValidateAsync(tenantId, fileName, content));
    }

    /// <summary>Creates every payment in a CSV batch file in one transaction, or none of them.</summary>
    [HttpPost("batch")]
    [Authorize(Roles = UserRoles.CreatorRoles)]
    [RequestSizeLimit(MaxUploadRequestBytes)]
    [RequestFormLimits(MultipartBodyLengthLimit = MaxUploadRequestBytes)]
    public async Task<ActionResult<BatchResultDto>> CreateBatch(
        IFormFile? file,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey = null)
    {
        if (User.GetUserId() is not { } userId || User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        var (fileName, content) = await ReadFileAsync(file);
        var result = await batchPaymentService.CreateAsync(tenantId, userId, fileName, content, idempotencyKey);
        return Created("/api/payments", result);
    }

    private static async Task<(string FileName, byte[] Content)> ReadFileAsync(IFormFile? file)
    {
        if (file is null)
        {
            throw new BatchFileMissingException();
        }

        using var buffer = new MemoryStream();
        await file.CopyToAsync(buffer);
        return (file.FileName, buffer.ToArray());
    }
}
