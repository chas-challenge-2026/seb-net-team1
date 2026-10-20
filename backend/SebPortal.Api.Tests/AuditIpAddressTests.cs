using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using SebPortal.Api.Signing;

namespace SebPortal.Api.Tests;

public sealed class AuditIpAddressTests
{
    private const string LegacyCanonical =
        "{\"TenantId\":1,\"UserId\":null,\"Action\":\"SYSTEM_EVENT\",\"EntityType\":null," +
        "\"EntityId\":null,\"Description\":null,\"CreatedAt\":\"2026-09-29T14:32:00Z\"," +
        "\"PreviousSignature\":\"GENESIS\"}";

    [Theory]
    [InlineData("203.0.113.7", "203.0.113.7", true)]
    [InlineData("2001:db8::7", "2001:db8::7", true)]
    [InlineData("::ffff:203.0.113.7", "203.0.113.7", true)]
    [InlineData(null, null, true)]
    [InlineData(null, null, false)]
    public async Task LogImmediatelyAsync_RecordsConnectionIpInStorageDtoAndSignedFields(
        string? remoteIp, string? expectedIp, bool hasRequest)
    {
        using var db = CreateContext();
        var context = hasRequest ? new DefaultHttpContext() : null;
        if (context is not null)
        {
            context.Connection.RemoteIpAddress = remoteIp is null ? null : IPAddress.Parse(remoteIp);
            // Forwarded headers are processed by trusted middleware, never by the service.
            context.Request.Headers["X-Forwarded-For"] = "198.51.100.99";
        }
        var signer = new RecordingSigner();
        var service = new AuditService(new AuditRepository(db), new AuditLockProvider(), signer,
            new HttpContextAccessor { HttpContext = context });

        await service.LogImmediatelyAsync(1, null, "SYSTEM_EVENT", null, null, "Test event");

        var stored = await db.AuditEntries.AsNoTracking().SingleAsync();
        Assert.Equal(expectedIp, stored.IpAddress);
        var returned = Assert.Single((await service.GetAuditLogAsync(1, 50, null)).Entries);
        Assert.Equal(expectedIp, returned.IpAddress);
        Assert.Equal(AuditSigningFormat.Build(stored, stored.PreviousSignature), signer.SignedText);
        using var signed = JsonDocument.Parse(Assert.IsType<string>(signer.SignedText));
        if (expectedIp is null)
            Assert.False(signed.RootElement.TryGetProperty("IpAddress", out _));
        else
            Assert.Equal(expectedIp, signed.RootElement.GetProperty("IpAddress").GetString());
    }

    [Fact]
    public void Build_WithoutIpAddress_PreservesCompleteLegacyCanonicalJson()
    {
        var entry = LegacyEntry();

        Assert.Equal(LegacyCanonical, AuditSigningFormat.Build(entry, "GENESIS"));
    }

    [Fact]
    public void Build_WithIpAddress_AppendsItAndChangesCanonicalTextWhenIpChanges()
    {
        var entry = LegacyEntry();
        entry.IpAddress = "203.0.113.7";

        var first = AuditSigningFormat.Build(entry, "GENESIS");

        Assert.Equal(LegacyCanonical[..^1] + ",\"IpAddress\":\"203.0.113.7\"}", first);
        entry.IpAddress = "203.0.113.8";
        Assert.NotEqual(first, AuditSigningFormat.Build(entry, "GENESIS"));
        entry.IpAddress = null;
        Assert.Equal(LegacyCanonical, AuditSigningFormat.Build(entry, "GENESIS"));
    }

    private static SebDbContext CreateContext() => new(
        new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase($"AuditIp-{Guid.NewGuid():N}").Options);

    private static AuditEntry LegacyEntry() => new()
    {
        TenantId = 1,
        Action = "SYSTEM_EVENT",
        CreatedAt = new DateTime(2026, 9, 29, 14, 32, 0, DateTimeKind.Utc)
    };

    private sealed class RecordingSigner : IAuditSigner
    {
        public string? SignedText { get; private set; }

        public string Sign(string canonicalJson)
        {
            SignedText = canonicalJson;
            return "TEST_SIGNATURE";
        }

        public bool Verify(string canonicalJson, string signature) =>
            canonicalJson == SignedText && signature == "TEST_SIGNATURE";
    }
}
