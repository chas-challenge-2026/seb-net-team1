using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using Xunit;

namespace SebPortal.Api.Tests;

public class UserRepositoryTests
{
    [Fact]
    public void GetByEmail_WhenUserExists_ReturnsUser()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        using (var context = new SebDbContext(options))
        {
            var tenant = new Tenant { Id = 1, Name = "Malmö Bygg AB" };
            context.Tenants.Add(tenant);
            context.Users.Add(new User
            {
                Id = 1,
                TenantId = 1,
                Name = "Lisa Andersson",
                Email = "lisa@malmobygg.se",
                Role = "initiator",
                PasswordHash = "hash123"
            });
            context.SaveChanges();
        }

        using (var context = new SebDbContext(options))
        {
            var repository = new UserRepository(context);

            // Act
            var user = repository.GetByEmail("lisa@malmobygg.se");

            // Assert
            Assert.NotNull(user);
            Assert.Equal("Lisa Andersson", user.Name);
            Assert.Equal("lisa@malmobygg.se", user.Email);
            Assert.Equal("initiator", user.Role);
            Assert.Equal("hash123", user.PasswordHash);
        }
    }

    [Fact]
    public void GetByEmail_WhenUserDoesNotExist_ReturnsNull()
    {
        // Arrange
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        using var context = new SebDbContext(options);
        var repository = new UserRepository(context);

        // Act
        var user = repository.GetByEmail("nonexistent@malmobygg.se");

        // Assert
        Assert.Null(user);
    }
}

