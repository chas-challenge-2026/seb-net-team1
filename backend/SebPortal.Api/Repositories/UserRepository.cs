using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class UserRepository
{
    private readonly SebDbContext _context;

    public UserRepository(SebDbContext context)
    {
        _context = context;
    }

    public User? GetByEmail(string email)
    {
        var normalized = NormalizeEmail(email);
        return _context.Users
            .AsNoTracking()
            .FirstOrDefault(u => u.Email.ToLower() == normalized);
    }

    /// <summary>Tracked, with the tenant, for login.</summary>
    public Task<User?> GetByEmailWithTenantAsync(string email)
    {
        var normalized = NormalizeEmail(email);
        return _context.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Email.ToLower() == normalized);
    }

    public Task<User?> GetByIdAsync(int userId) =>
        _context.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Id == userId);

    public Task<User?> GetInTenantAsync(int userId, int tenantId) =>
        _context.Users
            .Include(u => u.Tenant)
            .FirstOrDefaultAsync(u => u.Id == userId && u.TenantId == tenantId);

    public Task<List<User>> GetAllInTenantAsync(int tenantId) =>
        _context.Users
            .AsNoTracking()
            .Where(u => u.TenantId == tenantId)
            .OrderBy(u => u.Name)
            .ToListAsync();

    public Task<bool> EmailExistsAsync(string email)
    {
        var normalized = NormalizeEmail(email);
        return _context.Users.AnyAsync(u => u.Email.ToLower() == normalized);
    }

    /// <summary>Active users with the given roles, e.g. every admin who should hear about an unassigned step.</summary>
    public Task<List<User>> GetActiveByRolesAsync(int tenantId, params string[] roles) =>
        _context.Users
            .Where(u => u.TenantId == tenantId && u.IsActive && roles.Contains(u.Role))
            .OrderBy(u => u.Id)
            .ToListAsync();

    public void Add(User user) => _context.Users.Add(user);

    public void AddAuditEntry(AuditEntry entry) => _context.AuditEntries.Add(entry);

    public Task SaveChangesAsync() => _context.SaveChangesAsync();

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}

public class RefreshTokenRepository(SebDbContext dbContext)
{
    public Task<RefreshToken?> GetByHashAsync(string tokenHash) =>
        dbContext.RefreshTokens
            .Include(t => t.User!).ThenInclude(u => u.Tenant)
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash);

    public void Add(RefreshToken token) => dbContext.RefreshTokens.Add(token);

    /// <summary>Revokes every still active token in a family (used on reuse detection and logout).</summary>
    public async Task RevokeFamilyAsync(Guid familyId, DateTime now)
    {
        var tokens = await dbContext.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ToListAsync();

        foreach (var token in tokens)
        {
            token.RevokedAt = now;
        }
    }

    /// <summary>Revokes all of a user's sessions, e.g. after a password reset or deactivation.</summary>
    public async Task RevokeAllForUserAsync(int userId, DateTime now)
    {
        var tokens = await dbContext.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ToListAsync();

        foreach (var token in tokens)
        {
            token.RevokedAt = now;
        }
    }

    public Task SaveChangesAsync() => dbContext.SaveChangesAsync();
}
