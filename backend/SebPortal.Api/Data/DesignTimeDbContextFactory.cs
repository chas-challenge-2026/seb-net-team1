using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace SebPortal.Api.Data;

/// <summary>
/// Used by the dotnet-ef tool (dotnet ef migrations add ...) so creating a migration
/// never starts the application or needs a real database. The connection string is a
/// placeholder: adding a migration does not connect.
/// </summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<SebDbContext>
{
    public SebDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseNpgsql("Host=localhost;Database=seb_design_time")
            .Options;

        return new SebDbContext(options);
    }
}
