using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;

namespace SebPortal.Api.Tests;

/// <summary>
/// User administration (acceptance criterion: "Bcrypt-lösenord — unit test på
/// UserService.CreateUser"). v1 stored MD5 hashes (BUG-002).
/// </summary>
public class UserServiceTests
{
    private const int TenantId = 1;
    private const int AdminId = 3;

    private static (SebDbContext Db, UserService Service) Create()
    {
        var db = TestServices.CreateContext();
        db.Tenants.Add(new Tenant { Id = TenantId, Name = "Malmö Bygg AB" });
        db.Users.Add(new User { Id = AdminId, TenantId = TenantId, Name = "Sara Ek", Email = "sara@malmobygg.se", Role = UserRoles.Admin });
        db.SaveChanges();

        var service = new UserService(new UserRepository(db), new RefreshTokenRepository(db), new PasswordHasher(), new UnitOfWork(db));
        return (db, service);
    }

    [Fact]
    public async Task CreateUserAsync_StoresABcryptHash_NotThePassword()
    {
        var (db, service) = Create();

        var created = await service.CreateUserAsync(TenantId, AdminId, new CreateUserRequest
        {
            Name = "Erik Lind",
            Email = "Erik@MalmoBygg.se",
            Role = "attestant",
            Password = "hemligt-lösen-123"
        });

        var stored = db.Users.Single(u => u.Id == created.Id);

        Assert.NotEqual("hemligt-lösen-123", stored.PasswordHash);
        Assert.StartsWith("$2", stored.PasswordHash);                   // BCrypt format
        Assert.Equal(60, stored.PasswordHash!.Length);
        Assert.True(BCrypt.Net.BCrypt.Verify("hemligt-lösen-123", stored.PasswordHash));
        Assert.False(BCrypt.Net.BCrypt.Verify("fel-lösen", stored.PasswordHash));
        Assert.DoesNotMatch("^[0-9a-f]{32}$", stored.PasswordHash);    // not MD5

        Assert.Equal("erik@malmobygg.se", stored.Email);
        Assert.Equal(UserRoles.Attestant, stored.Role);
        Assert.True(stored.IsActive);
        Assert.Single(db.AuditEntries, e => e.Action == AuditActions.UserCreated && e.EntityId == created.Id);
    }

    [Fact]
    public async Task CreateUserAsync_SaltsEveryHash()
    {
        var (db, service) = Create();

        var first = await service.CreateUserAsync(TenantId, AdminId, new CreateUserRequest
            { Name = "Ett", Email = "ett@malmobygg.se", Role = "initiator", Password = "samma-lösenord" });
        var second = await service.CreateUserAsync(TenantId, AdminId, new CreateUserRequest
            { Name = "Två", Email = "tva@malmobygg.se", Role = "initiator", Password = "samma-lösenord" });

        Assert.NotEqual(
            db.Users.Single(u => u.Id == first.Id).PasswordHash,
            db.Users.Single(u => u.Id == second.Id).PasswordHash);
    }

    [Fact]
    public async Task CreateUserAsync_RejectsDuplicateEmail_CaseInsensitive()
    {
        var (_, service) = Create();

        await Assert.ThrowsAsync<EmailAlreadyInUseException>(() => service.CreateUserAsync(TenantId, AdminId, new CreateUserRequest
            { Name = "Sara Igen", Email = "SARA@malmobygg.se", Role = "initiator", Password = "password123" }));
    }

    [Theory]
    [InlineData("Namn", "inte-en-epost", "initiator", "password123")]
    [InlineData("Namn", "ny@malmobygg.se", "superuser", "password123")]
    [InlineData("N", "ny@malmobygg.se", "initiator", "password123")]
    public async Task CreateUserAsync_RejectsInvalidData(string name, string email, string role, string password)
    {
        var (db, service) = Create();

        await Assert.ThrowsAsync<InvalidUserDataException>(() => service.CreateUserAsync(TenantId, AdminId, new CreateUserRequest
            { Name = name, Email = email, Role = role, Password = password }));
        Assert.Single(db.Users);
    }

    [Fact]
    public async Task CreateUserAsync_RejectsShortPassword()
    {
        var (_, service) = Create();

        await Assert.ThrowsAsync<WeakPasswordException>(() => service.CreateUserAsync(TenantId, AdminId, new CreateUserRequest
            { Name = "Ny Person", Email = "ny@malmobygg.se", Role = "initiator", Password = "kort" }));
    }

    [Theory]
    [InlineData("initiator", true)]
    [InlineData("admin", false)]
    public async Task UpdateUserAsync_StopsAnAdminFromLockingThemselvesOut(string role, bool isActive)
    {
        var (_, service) = Create();

        await Assert.ThrowsAsync<CannotChangeOwnAccessException>(() =>
            service.UpdateUserAsync(TenantId, AdminId, AdminId, new UpdateUserRequest { Name = "Sara Ek", Role = role, IsActive = isActive }));
    }

    [Fact]
    public async Task UpdateUserAsync_DeactivationRevokesTheUsersSessions()
    {
        var (db, service) = Create();
        db.Users.Add(new User { Id = 5, TenantId = TenantId, Name = "Lisa Persson", Email = "lisa@malmobygg.se", Role = UserRoles.Initiator });
        db.RefreshTokens.Add(new RefreshToken { UserId = 5, TokenHash = "abc", FamilyId = Guid.NewGuid(), ExpiresAt = DateTime.UtcNow.AddDays(1) });
        db.SaveChanges();

        var updated = await service.UpdateUserAsync(TenantId, AdminId, 5, new UpdateUserRequest { Name = "Lisa Persson", Role = "initiator", IsActive = false });

        Assert.False(updated.IsActive);
        Assert.All(db.RefreshTokens, t => Assert.NotNull(t.RevokedAt));
    }

    [Fact]
    public async Task UpdateUserAsync_CannotReachUsersInAnotherTenant()
    {
        var (db, service) = Create();
        db.Tenants.Add(new Tenant { Id = 2, Name = "Annat AB" });
        db.Users.Add(new User { Id = 9, TenantId = 2, Name = "Främling", Email = "x@annat.se", Role = UserRoles.Initiator });
        db.SaveChanges();

        await Assert.ThrowsAsync<UserNotFoundException>(() =>
            service.UpdateUserAsync(TenantId, AdminId, 9, new UpdateUserRequest { Name = "Hackad", Role = "admin", IsActive = true }));
    }
}
