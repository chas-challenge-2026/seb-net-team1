using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Tests;

/// <summary>
/// Verifies that the payment endpoint checks the IBAN checksum (MOD97), not only
/// its format.
/// </summary>
public class PaymentIbanValidationTests : IClassFixture<PaymentApiFactory>
{
    private readonly PaymentApiFactory _factory;
    private readonly HttpClient _client;

    public PaymentIbanValidationTests(PaymentApiFactory factory)
    {
        _factory = factory;

        _client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });
    }

    /// <summary>
    /// Verifies that IBANs with correct check digits are accepted.
    /// </summary>
    [Theory]
    [InlineData("SE3550000000054910000003")]
    [InlineData("SE4550000000058398257466")]
    [InlineData("GB82WEST12345698765432")]
    [InlineData("DE89370400440532013000")]
    public void HasValidIbanFormat_WithCorrectChecksum_ReturnsTrue(string iban)
    {
        Assert.True(PaymentService.HasValidIbanFormat(iban));
    }

    /// <summary>
    /// Verifies that a well-formed IBAN with wrong check digits is rejected, which is
    /// the case the old format-only check let through.
    /// </summary>
    [Theory]
    [InlineData("SE4550000000054910000099")]
    [InlineData("SE3550000000054910000004")]
    [InlineData("GB83WEST12345698765432")]
    [InlineData("DE89370400440532013001")]
    public void HasValidIbanFormat_WithWrongChecksum_ReturnsFalse(string iban)
    {
        Assert.False(PaymentService.HasValidIbanFormat(iban));
    }

    /// <summary>
    /// Verifies that malformed input is still rejected before the checksum is read.
    /// </summary>
    [Theory]
    [InlineData("")]
    [InlineData("SE35")]
    [InlineData("1235500000005491000000")]
    [InlineData("SE35500000000549100000!3")]
    public void HasValidIbanFormat_WithMalformedInput_ReturnsFalse(string iban)
    {
        Assert.False(PaymentService.HasValidIbanFormat(iban));
    }

    /// <summary>
    /// Verifies that the endpoint answers 400 for a wrong checksum and creates nothing.
    /// </summary>
    [Fact]
    public async Task CreatePayment_WithWrongIbanChecksum_ReturnsBadRequest()
    {
        using var scope = _factory.Services.CreateScope();

        var token = scope.ServiceProvider
            .GetRequiredService<JwtTokenService>()
            .GenerateToken(
                userId: 1,
                tenantId: 1,
                email: "lisa@malmobygg.se",
                role: "initiator",
                name: "Lisa Persson");

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/payments")
        {
            Content = JsonContent.Create(new CreatePaymentRequestDto
            {
                FromAccountId = 1,
                ToIban = "SE4550000000054910000099",
                Amount = 100m,
                Reference = "Wrong checksum"
            })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("IBAN", await response.Content.ReadAsStringAsync());
    }
}