using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using Xunit;

namespace SebPortal.Api.Tests;

public class AuditLogServiceTests
{
    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(options);
    }

    private static void SeedTwoTenants(SebDbContext db)
    {
        db.Tenants.AddRange(
            new Tenant { Id = 1, Name = "Runö Bygg AB" },
            new Tenant { Id = 2, Name = "Annat AB" });
        db.Users.AddRange(
            new User { Id = 1, TenantId = 1, Name = "Papper Pappersson", Email = "papper@runobygg.se", Role = "initiator" },
            new User { Id = 2, TenantId = 2, Name = "Främling", Email = "framling@annat.se", Role = "initiator" });
        db.SaveChanges();
    }

    private static AuditLogService CreateService(SebDbContext db) => TestServices.AuditLogService(db);

    [Fact]
    public async Task GetAuditLogAsync_ReturnsOnlyOwnTenantsEntries_NewestFirst()
    {
        using var db = CreateContext();
        SeedTwoTenants(db);
        db.AuditEntries.AddRange(
            new AuditEntry { Id = 1, TenantId = 1, UserId = 1, Action = "CREATE_PAYMENT", Description = "Första" },
            new AuditEntry { Id = 2, TenantId = 2, UserId = 2, Action = "CREATE_PAYMENT", Description = "Annan tenant" },
            new AuditEntry { Id = 3, TenantId = 1, UserId = 1, Action = "APPROVE_PAYMENT", Description = "Andra" });
        db.SaveChanges();

        var result = await CreateService(db).GetAuditLogAsync(tenantId: 1, limit: null, cursor: null);

        Assert.Equal(new[] { 3, 1 }, result.Entries.Select(e => e.Id));
        Assert.All(result.Entries, e => Assert.Equal("Papper Pappersson", e.UserName));
        Assert.Null(result.NextCursor);
    }

    [Fact]
    public async Task GetAuditLogAsync_PagesWithCursor()
    {
        using var db = CreateContext();
        SeedTwoTenants(db);
        for (var id = 1; id <= 5; id++)
        {
            db.AuditEntries.Add(new AuditEntry { Id = id, TenantId = 1, UserId = 1, Action = "CREATE_PAYMENT" });
        }
        db.SaveChanges();
        var service = CreateService(db);

        var firstPage = await service.GetAuditLogAsync(tenantId: 1, limit: 2, cursor: null);
        var secondPage = await service.GetAuditLogAsync(tenantId: 1, limit: 2, cursor: firstPage.NextCursor);
        var lastPage = await service.GetAuditLogAsync(tenantId: 1, limit: 2, cursor: secondPage.NextCursor);

        Assert.Equal(new[] { 5, 4 }, firstPage.Entries.Select(e => e.Id));
        Assert.Equal(new[] { 3, 2 }, secondPage.Entries.Select(e => e.Id));
        Assert.Equal(new[] { 1 }, lastPage.Entries.Select(e => e.Id));
        Assert.Null(lastPage.NextCursor);
    }
}
