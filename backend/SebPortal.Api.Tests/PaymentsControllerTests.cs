using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Controllers;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Services;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Options;

namespace SebPortal.Api.Tests;

/// <summary>
/// Tests the US-21 payment API endpoint behavior for valid and invalid payment requests.
/// </summary>
public class PaymentsControllerTests
{
    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(options);
    }

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
    public async Task CreatePayment_WhenRequestIsValid_ReturnsCreated()
    {
        // Arrange
        using var db = CreateContext();

        db.Accounts.Add(new Account
        {
            Id = 1,
            TenantId = 1,
            AccountName = "Företagskonto",
            Iban = "SE3550000000054910000003",
            Balance = 100000m,
            Currency = "SEK"
        });

        await db.SaveChangesAsync();

        var controller = TestServices.PaymentsController(db);

        SetAuthenticatedUser(controller);

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "SE6250000000054910000099",
            Amount = 12500m,
            Reference = "Faktura #2001"
        };

        // Act
        var result = await controller.CreatePayment(request);

        // Assert
        var createdResult = Assert.IsType<CreatedResult>(result);
        var response = Assert.IsType<PaymentResponseDto>(createdResult.Value);

        Assert.Equal(1, response.Id);
        Assert.Equal("completed", response.Status);
        Assert.Equal(1, response.FromAccountId);
        Assert.Equal("SE6250000000054910000099", response.ToIban);
        Assert.Equal("12500.00", response.Amount);
        Assert.Equal("SEK", response.Currency);
        Assert.Equal("Faktura #2001", response.Reference);
    }

    /// <summary>
    /// Verifies that the endpoint rejects payment requests where the amount is
    /// not greater than zero.
    /// </summary>
    [Fact]
    public async Task CreatePayment_WhenAmountIsInvalid_ReturnsBadRequest()
    {
        // Arrange
        using var db = CreateContext();

        var controller = TestServices.PaymentsController(db);

        SetAuthenticatedUser(controller);

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "SE6250000000054910000099",
            Amount = 0m,
            Reference = "Faktura #2001"
        };

        // Act & Assert: the exception becomes a 400 ProblemDetails in AppExceptionHandler
        var exception = await Assert.ThrowsAsync<InvalidPaymentAmountException>(() => controller.CreatePayment(request));
        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
    }

    /// <summary>
    /// Verifies that the endpoint rejects payment requests without a recipient IBAN.
    /// </summary>
    [Fact]
    public async Task CreatePayment_WhenToIbanIsMissing_ReturnsBadRequest()
    {
        // Arrange
        using var db = CreateContext();

        var controller = TestServices.PaymentsController(db);

        SetAuthenticatedUser(controller);

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 1,
            ToIban = "",
            Amount = 12500m,
            Reference = "Faktura #2001"
        };

        // Act & Assert: the exception becomes a 400 ProblemDetails in AppExceptionHandler
        var exception = await Assert.ThrowsAsync<InvalidIbanException>(() => controller.CreatePayment(request));
        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
    }

    /// <summary>
    /// Verifies that the endpoint rejects payment requests without a valid source account id.
    /// </summary>
    [Fact]
    public async Task CreatePayment_WhenFromAccountIdIsInvalid_ReturnsBadRequest()
    {
        // Arrange
        using var db = CreateContext();

        var controller = TestServices.PaymentsController(db);

        SetAuthenticatedUser(controller);

        var request = new CreatePaymentRequestDto
        {
            FromAccountId = 0,
            ToIban = "SE6250000000054910000099",
            Amount = 12500m,
            Reference = "Faktura #2001"
        };

        // Act & Assert: the exception becomes a 400 ProblemDetails in AppExceptionHandler
        var exception = await Assert.ThrowsAsync<MissingSourceAccountException>(() => controller.CreatePayment(request));
        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
    }
}
