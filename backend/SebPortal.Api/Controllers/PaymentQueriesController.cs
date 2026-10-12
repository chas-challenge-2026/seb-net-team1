using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/payments")]
public class PaymentQueriesController(PaymentQueryService paymentQueryService) : ControllerBase
{
    [HttpGet("{paymentId:int}")]
    public async Task<IActionResult> GetPayment(int paymentId)
    {
        var tenantId = User.GetTenantId();
        if (tenantId is null)
        {
            return Unauthorized(new { message = "Ogiltig eller saknad användarinformation i token." });
        }

        var payment = await paymentQueryService.GetPaymentAsync(paymentId, tenantId.Value);
        return payment is null
            ? NotFound(new { message = "Betalningen hittades inte." })
            : Ok(payment);
    }
}
