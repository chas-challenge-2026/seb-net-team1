using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.DTOs;

namespace SebPortal.Api.Controllers;
 
//  This returns hardcoded mock data for now
[ApiController]
[Route("api/[controller]")]
public class DashboardController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        var response = new DashboardResponse
        {
            TenantName = "Runö Bygg AB",
            User = new AuthenticatedUserDto
            {
                Id = 1,
                Name = "Papper Pappersson",
                Email = "papper@runobygg.se",
                Role = "attestant",
                TenantId = 1
            },
            Accounts =
            [
                new AccountDto
                {
                    Id = 1,
                    AccountName = "Företagskonto",
                    Iban = "SE3550000000054910000003",
                    Balance = "245000.50",
                    Currency = "SEK"
                }
            ],
            RecentPayments =
            [
                new PaymentSummaryDto
                {
                    Id = 42,
                    ToIban = "SE4550000000054910000099",
                    Amount = "12500.00",
                    Currency = "SEK",
                    Reference = "Faktura 2026-114",
                    Status = "pending_approval",
                    CreatedAt = new DateTime(2026, 8, 30, 9, 15, 0, DateTimeKind.Utc)
                }
            ],
            PendingApprovals =
            [
                new PaymentSummaryDto
                {
                    Id = 43,
                    ToIban = "SE1250000000054910000077",
                    Amount = "8000.00",
                    Currency = "SEK",
                    Reference = "Löner september",
                    Status = "pending_approval",
                    CreatedAt = new DateTime(2026, 8, 31, 14, 0, 0, DateTimeKind.Utc)
                }
            ],
            NextCursor = null
        };

        return Ok(response);
    }
}