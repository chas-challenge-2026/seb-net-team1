using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SebPortal.Api.Tests;

/// <summary>
/// Checks that login attempts are limited per client IP address, counted over a
/// sliding one-minute window. Each test builds
/// its own app with a limit of three attempts a minute, so the tests never share
/// a counter with each other or with the other integration tests.
/// </summary>
public class LoginRateLimitIntegrationTests : IClassFixture<CookieAuthenticationApiFactory>
{
	private const int Limit = 3;
	private readonly CookieAuthenticationApiFactory _factory;

	public LoginRateLimitIntegrationTests(CookieAuthenticationApiFactory factory)
	{
		_factory = factory;
	}

	[Fact]
	public async Task Login_ExactlyAtTheLimit_IsNotBlocked()
	{
		using var api = CreateApiWithLimit();
		using var client = CreateClient(api);

		for (var attempt = 1; attempt <= Limit; attempt++)
		{
			using var response = await LoginWithWrongPasswordAsync(client);

			Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
		}
	}

	[Fact]
	public async Task Login_OneAttemptOverTheLimit_ReturnsTooManyRequests()
	{
		using var api = CreateApiWithLimit();
		using var client = CreateClient(api);

		for (var attempt = 1; attempt <= Limit; attempt++)
		{
			using var allowed = await LoginWithWrongPasswordAsync(client);
			Assert.Equal(HttpStatusCode.Unauthorized, allowed.StatusCode);
		}

		using var blocked = await LoginWithWrongPasswordAsync(client);

		Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
	}

	[Fact]
	public async Task Login_WhenBlocked_ExplainsWhyAndHowLongToWait()
	{
		using var api = CreateApiWithLimit();
		using var client = CreateClient(api);

		for (var attempt = 1; attempt <= Limit; attempt++)
		{
			using var allowed = await LoginWithWrongPasswordAsync(client);
		}

		using var blocked = await LoginWithWrongPasswordAsync(client);

		var retryAfter = Assert.NotNull(blocked.Headers.RetryAfter?.Delta);
		Assert.InRange(retryAfter.TotalSeconds, 1, 60);
		using var body = JsonDocument.Parse(await blocked.Content.ReadAsStringAsync());
		Assert.Equal(429, body.RootElement.GetProperty("status").GetInt32());
		Assert.Contains("För många inloggningsförsök",
			body.RootElement.GetProperty("detail").GetString());
	}

	[Fact]
	public async Task Login_WhenBlocked_DoesNotBlockOtherEndpoints()
	{
		using var api = CreateApiWithLimit();
		using var client = CreateClient(api);

		for (var attempt = 1; attempt <= Limit + 1; attempt++)
		{
			using var response = await LoginWithWrongPasswordAsync(client);
		}

		using var csrf = await client.GetAsync("/api/auth/csrf");

		Assert.Equal(HttpStatusCode.OK, csrf.StatusCode);
	}

	private WebApplicationFactory<Program> CreateApiWithLimit() =>
		_factory.WithWebHostBuilder(builder =>
			builder.UseSetting("RateLimiting:LoginPermitLimit", Limit.ToString()));

	private static HttpClient CreateClient(WebApplicationFactory<Program> api) =>
		api.CreateClient(new WebApplicationFactoryClientOptions
		{
			BaseAddress = new Uri("https://localhost"),
			AllowAutoRedirect = false,
			HandleCookies = true
		});

	private static async Task<HttpResponseMessage> LoginWithWrongPasswordAsync(HttpClient client)
	{
		using var csrfResponse = await client.GetAsync("/api/auth/csrf");
		using var csrfBody = JsonDocument.Parse(await csrfResponse.Content.ReadAsStringAsync());
		var csrf = csrfBody.RootElement.GetProperty("requestToken").GetString()!;

		using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
		{
			Content = JsonContent.Create(new
			{
				email = CookieAuthenticationApiFactory.Email,
				password = "incorrect"
			})
		};
		request.Headers.Add("X-CSRF-TOKEN", csrf);

		return await client.SendAsync(request);
	}
}