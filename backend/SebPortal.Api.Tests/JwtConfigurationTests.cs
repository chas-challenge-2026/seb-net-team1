using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;
using SebPortal.Api.Auth;

namespace SebPortal.Api.Tests;

public class JwtConfigurationTests
{
    [Theory]
    [InlineData("Jwt:Key")]
    [InlineData("Jwt:PreviousKey")]
    public void Configuration_RejectsShortKeysWithoutDisclosingThem(string setting)
    {
        var shortKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16));
        var values = new Dictionary<string, string?>
        {
            ["Jwt:Key"] = NewKey(),
            [setting] = shortKey
        };

        var exception = Assert.Throws<InvalidOperationException>(() => Load(values));

        Assert.Contains(setting, exception.Message);
        Assert.DoesNotContain(shortKey, exception.Message);
    }

    [Fact]
    public void Configuration_RejectsWhitespacePreviousKey()
    {
        Assert.Throws<InvalidOperationException>(() => Load(new()
        {
            ["Jwt:Key"] = NewKey(),
            ["Jwt:PreviousKey"] = "   "
        }));
    }

    [Fact]
    public void Configuration_RejectsDuplicateActiveAndPreviousKeys()
    {
        var key = NewKey();
        var exception = Assert.Throws<InvalidOperationException>(() => Load(new()
        {
            ["Jwt:Key"] = key,
            ["Jwt:PreviousKey"] = key
        }));

        Assert.Contains("must differ", exception.Message);
        Assert.DoesNotContain(key, exception.Message);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Configuration_AllowsAnAbsentPreviousKey(string? previousKey)
    {
        var snapshot = Load(new()
        {
            ["Jwt:Key"] = NewKey(),
            ["Jwt:PreviousKey"] = previousKey
        });
        var token = new JwtTokenService(snapshot).GenerateToken(1, 1, "test@example.invalid", "initiator", "Test user");

        Assert.NotEmpty(token);
    }

    [Fact]
    public void Configuration_PreservesTheExistingUtf8KeyBytes()
    {
        var key = NewKey();
        var snapshot = Load(new() { ["Jwt:Key"] = key });

        Assert.Equal(System.Text.Encoding.UTF8.GetBytes(key), snapshot.ActiveKey.Key);
    }

    private static JwtConfiguration Load(Dictionary<string, string?> values) =>
        JwtConfiguration.FromConfiguration(new ConfigurationBuilder().AddInMemoryCollection(values).Build());

    private static string NewKey() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
}
