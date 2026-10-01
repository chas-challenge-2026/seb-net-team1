using Testcontainers.PostgreSql;

namespace SebPortal.Api.Tests;

/// <summary>
/// Starts a temporary PostgreSQL database for integration tests
/// and removes it after the tests have finished.
/// </summary>
public sealed class PostgreSqlFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container =
        new PostgreSqlBuilder("postgres:12")
            .WithDatabase("seb_test")
            .WithUsername("seb_test")
            .WithPassword(Guid.NewGuid().ToString("N"))
            .Build();

    public string ConnectionString =>
        _container.GetConnectionString();

    public Task InitializeAsync()
    {
        return _container.StartAsync();
    }

    public Task DisposeAsync()
    {
        return _container.DisposeAsync().AsTask();
    }
}
