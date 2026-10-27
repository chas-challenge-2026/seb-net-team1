using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Options;
using SebPortal.Api.Services;
using SebPortal.Api.Validation;

namespace SebPortal.Api.Controllers;

/// <summary>Business rules the frontend displays (thresholds, limits), so it never hardcodes them.</summary>
[ApiController]
[Authorize]
[Route("api/config")]
public class ConfigController(IOptions<PaymentRulesOptions> paymentRules, IOptions<BatchOptions> batchOptions) : ControllerBase
{
    [HttpGet]
    public ActionResult<ConfigResponse> Get() => Ok(new ConfigResponse
    {
        ApprovalThreshold = Money.Format(paymentRules.Value.ApprovalThreshold),
        DoubleApprovalThreshold = Money.Format(paymentRules.Value.DoubleApprovalThreshold),
        Currency = "SEK",
        MaxBatchFileSizeBytes = batchOptions.Value.MaxFileSizeBytes,
        MaxBatchRows = batchOptions.Value.MaxRows
    });
}

/// <summary>Live IBAN check for the payment form, using the same validator as payment creation.</summary>
[ApiController]
[Authorize]
[Route("api/validation")]
public class ValidationController(IIbanValidator ibanValidator) : ControllerBase
{
    [HttpGet("iban")]
    public ActionResult<IbanValidationResponse> Iban([FromQuery] string? value)
    {
        var result = ibanValidator.Validate(value);

        return Ok(new IbanValidationResponse
        {
            Valid = result.IsValid,
            Normalized = result.Normalized,
            Formatted = result.Formatted,
            CountryCode = result.CountryCode,
            ErrorCode = (int)result.ErrorCode,
            Message = result.Message
        });
    }
}

[ApiController]
[Authorize]
[Route("api/reports")]
public class ReportsController(ReportService reportService) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<ActionResult<ReportSummaryResponse>> Summary([FromQuery] int months = 6)
    {
        if (User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await reportService.GetSummaryAsync(tenantId, months));
    }
}
