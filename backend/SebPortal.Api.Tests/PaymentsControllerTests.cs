using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Controllers;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Tests;

/// <summary>
/// Tests the US-21 payment API endpoint behavior for valid and invalid payment requests.
/// </summary>
public class PaymentsControllerTests
{
    /// <summary>
    /// Adds a test user to the controller context so the controller can read
    /// user and tenant claims in the same way it does after JWT authentication.
    /// </summary>
    private static void SetAuthenticatedUser(
        PaymentsController controller,
        int userId = 1,
        int tenantId = 1,
        string role = "initiator")
    {
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(
                    new[]
                    {
                        new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
                        new Claim("tenantId", tenantId.ToString()),
                        new Claim(ClaimTypes.Role, role)
                    },
                    "TestAuth"))
            }
        };
    }

    /// <summary>
    /// Verifies that a valid payment request returns 201 Created with a response
    /// matching the payment API contract.
    /// </summary>
    [Fact]
    public void CreatePayment_WhenRequestIsValid_ReturnsCreated()
    {
        var controller = new PaymentsController(new PaymentService());
        SetAuthenticatedUser(controller);

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "SE4550000000054910000099",
            Amount = 12500m,
            Reference = "Faktura #2001"
        };

        var result = controller.CreatePayment(request);

        var createdResult = Assert.IsType<CreatedResult>(result);
        var response = Assert.IsType<PaymentResponseDto>(createdResult.Value);

        Assert.Equal(1, response.Id);
        Assert.Equal("pending_approval", response.Status);
        Assert.Equal(1, response.FromAccountId);
        Assert.Equal("SE4550000000054910000099", response.ToIban);
        Assert.Equal("12500.00", response.Amount);
        Assert.Equal("SEK", response.Currency);
        Assert.Equal("Faktura #2001", response.Reference);
    }

    /// <summary>
    /// Verifies that the endpoint rejects payment requests where the amount is
    /// not greater than zero.
    /// </summary>
    [Fact]
    public void CreatePayment_WhenAmountIsInvalid_ReturnsBadRequest()
    {
        var controller = new PaymentsController(new PaymentService());
        SetAuthenticatedUser(controller);

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "SE4550000000054910000099",
            Amount = 0m,
            Reference = "Faktura #2001"
        };

        var result = controller.CreatePayment(request);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    /// <summary>
    /// Verifies that the endpoint rejects payment requests without a recipient IBAN.
    /// </summary>
    [Fact]
    public void CreatePayment_WhenToIbanIsMissing_ReturnsBadRequest()
    {
        var controller = new PaymentsController(new PaymentService());
        SetAuthenticatedUser(controller);

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "",
            Amount = 12500m,
            Reference = "Faktura #2001"
        };

        var result = controller.CreatePayment(request);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    /// <summary>
    /// Verifies that the endpoint rejects payment requests without a valid source account id.
    /// </summary>
    [Fact]
    public void CreatePayment_WhenFromAccountIdIsInvalid_ReturnsBadRequest()
    {
        var controller = new PaymentsController(new PaymentService());
        SetAuthenticatedUser(controller);

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 0,
            ToIban = "SE4550000000054910000099",
            Amount = 12500m,
            Reference = "Faktura #2001"
        };

        var result = controller.CreatePayment(request);

        Assert.IsType<BadRequestObjectResult>(result);
    }
}
