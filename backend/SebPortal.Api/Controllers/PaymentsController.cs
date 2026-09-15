using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.DTOs;

namespace SebPortal.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentsController : ControllerBase
{
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

        return BadRequest(new { message = "Not implemented yet." });


    }

}