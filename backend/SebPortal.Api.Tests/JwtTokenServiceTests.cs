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
        var service = new JwtTokenService(_configuration);

        // Act
        var token = service.GenerateToken(
            userId: 1,
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
        var service = new JwtTokenService(_configuration);
        var expectedUserId = 42;
        var expectedEmail = "johan@malmobygg.se";
        var expectedRole = "attestant";
        var expectedName = "Johan Berg";

        // Act
        var tokenString = service.GenerateToken(
            userId: expectedUserId,
            email: expectedEmail,
            role: expectedRole,
            name: expectedName);

        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(tokenString);

        // Assert claims
        Assert.Equal("TestIssuer", jwtToken.Issuer);
        Assert.Contains("TestAudience", jwtToken.Audiences);

        Assert.Equal(expectedUserId.ToString(), jwtToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal(expectedEmail, jwtToken.Claims.First(c => c.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.Equal(expectedName, jwtToken.Claims.First(c => c.Type == ClaimTypes.Name).Value);
        Assert.Equal(expectedRole, jwtToken.Claims.First(c => c.Type == ClaimTypes.Role).Value);
    }

    [Fact]
    public void GenerateToken_CanBeValidatedWithConfiguredSecretKey()
    {
        // Arrange
        var service = new JwtTokenService(_configuration);
        var tokenString = service.GenerateToken(1, "sara@malmobygg.se", "admin", "Sara Ek");

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

    [Fact]
    public void GenerateToken_WorksWithDefaultFallbackConfiguration()
    {
        // Arrange - empty configuration to trigger fallbacks
        var emptyConfig = new ConfigurationBuilder().Build();
        var service = new JwtTokenService(emptyConfig);

        // Act
        var tokenString = service.GenerateToken(1, "test@seb.se", "initiator", "Test User");

        // Assert
        Assert.False(string.IsNullOrWhiteSpace(tokenString));

        var handler = new JwtSecurityTokenHandler();
        var jwtToken = handler.ReadJwtToken(tokenString);
        Assert.Equal("SebPortal.Api", jwtToken.Issuer);
        Assert.Contains("SebPortal.Client", jwtToken.Audiences);
    }
}
