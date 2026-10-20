using System.Net;
using System.Net.Http.Headers;
using Microsoft.Extensions.DependencyInjection;
using SebPortal.Api.Auth;

namespace SebPortal.Api.Tests;

public class AuditLogFilterValidationIntegrationTests(PaymentApiFactory factory)
    : IClassFixture<PaymentApiFactory>
{
    [Theory]
    [InlineData("userId=-1")]
    [InlineData("userId=not-a-number")]
    [InlineData("from=not-a-date")]
    [InlineData("to=not-a-date")]
    [InlineData("from=2026-10-15T00:00:00Z&to=2026-10-14T00:00:00Z")]
    [InlineData("from=2026-10-14T00:00:00Z&to=2026-10-14T00:00:00Z")]
    [InlineData("action=%20%20%20")]
    public async Task InvalidFilters_ReturnBadRequest(string query)
    {
        using var client = AuthorizedClient();

        var response = await client.GetAsync($"/api/audit-log?{query}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("search", 201)]
    [InlineData("action", 101)]
    public async Task OverlongFilters_ReturnBadRequest(string parameter, int length)
    {
        using var client = AuthorizedClient();

        var response = await client.GetAsync($"/api/audit-log?{parameter}={new string('x', length)}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task SearchMaximumLength_IsMeasuredAfterTrimming()
    {
        using var client = AuthorizedClient();

        var response = await client.GetAsync($"/api/audit-log?search=%20{new string('x', 200)}%20");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private HttpClient AuthorizedClient()
    {
        var client = factory.CreateClient();
        using var scope = factory.Services.CreateScope();
        var token = scope.ServiceProvider.GetRequiredService<JwtTokenService>()
            .GenerateToken(1, 1, "test@example.test", "admin", "Test User");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }
}
