using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using SebPortal.Api.Auth;
using Xunit;

namespace SebPortal.Api.Tests;

public class JwtTokenServiceTests
{
    private readonly IConfiguration _configuration;

    public JwtTokenServiceTests()
    {
        var inMemorySettings = new Dictionary<string, string?>
        {
            ["Jwt:Key"] = "SuperSecretTestKeyThatIsAtLeast32BytesLong123!",
            ["Jwt:Issuer"] = "TestIssuer",
            ["Jwt:Audience"] = "TestAudience"
        };

        _configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(inMemorySettings)
            .Build();
    }

    [Fact]
    public void GenerateToken_ReturnsNonEmptyString()
    {
        // Arrange
        var service = new JwtTokenService(JwtConfiguration.FromConfiguration(_configuration));

        // Act
        var token = service.GenerateToken(
            userId: 1,
            tenantId: 1,
            email: "lisa@malmobygg.se",
            role: "initiator",
            name: "Lisa Persson");

        // Assert
        Assert.False(string.IsNullOrWhiteSpace(token));
    }

    [Fact]
    public void GenerateToken_ProducesValidJwtWithExpectedClaims()
    {
        // Arrange
        var service = new JwtTokenService(JwtConfiguration.FromConfiguration(_configuration));
        var expectedUserId = 42;
        var expectedTenantId = 1;
        var expectedEmail = "johan@malmobygg.se";
        var expectedRole = "attestant";
        var expectedName = "Johan Berg";

        // Act
        var tokenString = service.GenerateToken(
            userId: expectedUserId,
            tenantId: expectedTenantId,
            email: expectedEmail,
            role: expectedRole,
            name: expectedName);


        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(tokenString);

        // Assert claims
        Assert.Equal("TestIssuer", jwtToken.Issuer);
        Assert.Contains("TestAudience", jwtToken.Audiences);
        Assert.Equal(expectedUserId.ToString(), jwtToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal(expectedTenantId.ToString(), jwtToken.Claims.First(c => c.Type == "tenantId").Value);
        Assert.Equal(expectedEmail, jwtToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.Equal(expectedName, jwtToken.Claims.First(c => c.Type == ClaimTypes.Name).Value);
        Assert.Equal(expectedRole, jwtToken.Claims.First(c => c.Type == ClaimTypes.Role).Value);

    }

    [Fact]
    public void GenerateToken_CanBeValidatedWithConfiguredSecretKey()
    {
        // Arrange
        var service = new JwtTokenService(JwtConfiguration.FromConfiguration(_configuration));
        var tokenString = service.GenerateToken(1, 1, "sara@malmobygg.se", "admin", "Sara Ek");

        var tokenHandler = new JwtSecurityTokenHandler();
        var validationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("SuperSecretTestKeyThatIsAtLeast32BytesLong123!")),
            ValidateIssuer = true,
            ValidIssuer = "TestIssuer",
            ValidateAudience = true,
            ValidAudience = "TestAudience",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        // Act & Assert (ValidateToken will throw if signature, expiration, or claims are invalid)
        var principal = tokenHandler.ValidateToken(tokenString, validationParameters, out var validatedToken);

        Assert.NotNull(validatedToken);
        Assert.NotNull(principal);
        Assert.True(principal.Identity?.IsAuthenticated);
        Assert.Equal("sara@malmobygg.se", principal.FindFirst(ClaimTypes.Email)?.Value ?? principal.FindFirst(JwtRegisteredClaimNames.Email)?.Value);
    }

    // Verifies that no JWT token is created when the key is missing, empty, or contains only whitespace.
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void GenerateToken_RejectsMissingOrBlankKey(string? key)
    {
        var emptyConfig = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Key"] = key })
            .Build();
        var exception = Assert.Throws<InvalidOperationException>(() =>
        {
            var service = new JwtTokenService(JwtConfiguration.FromConfiguration(emptyConfig));
            service.GenerateToken(1, 1, "test@seb.se", "initiator", "Test User");
        });
        Assert.Contains("Jwt:Key", exception.Message);
    }
}
