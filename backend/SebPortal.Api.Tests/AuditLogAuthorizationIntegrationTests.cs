using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using SebPortal.Api.Auth;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>
/// Verifies who may read the audit log through the complete HTTP and JWT pipeline.
/// </summary>
public class AuditLogAuthorizationIntegrationTests
	: IClassFixture<PaymentApiFactory>
{
	private readonly PaymentApiFactory _factory;
	private readonly HttpClient _client;

	public AuditLogAuthorizationIntegrationTests(PaymentApiFactory factory)
	{
		_factory = factory;

		_client = factory.CreateClient(new WebApplicationFactoryClientOptions
		{
			AllowAutoRedirect = false
		});
	}

	/// <summary>
	/// Verifies that the audit log rejects requests without a JWT.
	/// </summary>
	[Fact]
	public async Task GetAuditLog_WithoutToken_ReturnsUnauthorized()
	{
		var response = await _client.GetAsync("/api/audit-log");

		Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
	}

	/// <summary>
	/// Verifies that only attestant and admin can read the audit log. An initiator
	/// only creates payments, so the endpoint must answer 403.
	/// </summary>
	[Theory]
	[InlineData("attestant", HttpStatusCode.OK)]
	[InlineData("admin", HttpStatusCode.OK)]
	[InlineData("initiator", HttpStatusCode.Forbidden)]
	public async Task GetAuditLog_DependsOnRole(string role, HttpStatusCode expected)
	{
		using var scope = _factory.Services.CreateScope();

		var token = scope.ServiceProvider
			.GetRequiredService<JwtTokenService>()
			.GenerateToken(
				userId: 1,
				tenantId: 1,
				email: "test@malmobygg.se",
				role: role,
				name: "Test User");

		using var request = new HttpRequestMessage(HttpMethod.Get, "/api/audit-log");
		request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

		var response = await _client.SendAsync(request);

		Assert.Equal(expected, response.StatusCode);
	}
}