using System.Security.Cryptography;
using System.Text;
using SebPortal.Api.Auditing;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

/// <summary>A login or refresh result: the response body plus the new refresh token for the cookie.</summary>
public sealed record AuthSession(LoginResponse Response, string RefreshToken, DateTime RefreshTokenExpiresAt);

public class AuthService(
    UserRepository userRepository,
    RefreshTokenRepository refreshTokenRepository,
    PasswordHasher passwordHasher,
    JwtTokenService jwtTokenService,
    JwtSettings jwtSettings)
{
    public const int MinimumPasswordLength = 8;

    // Verified against when the e-mail does not exist, so a login attempt for an
    // unknown user takes as long as one with a wrong password (no user enumeration).
    private static readonly Lazy<string> DummyHash = new(() => BCrypt.Net.BCrypt.HashPassword("not-a-real-password"));

    /// <summary>
    /// Verifies the credentials and starts a new session. v1 built this query by
    /// string concatenation (BUG-001) and compared MD5 hashes (BUG-002).
    /// </summary>
    public async Task<AuthSession> LoginAsync(string email, string password, string? ipAddress)
    {
        var user = await userRepository.GetByEmailWithTenantAsync(email);

        var passwordMatches = passwordHasher.VerifyPassword(password, user?.PasswordHash ?? DummyHash.Value);

        if (user is null || user.PasswordHash is null || !passwordMatches || !user.IsActive)
        {
            throw new InvalidCredentialsException();
        }

        var session = IssueSession(user, familyId: Guid.NewGuid(), ipAddress);

        userRepository.AddAuditEntry(Audit.Entry(
            user.TenantId, user.Id, AuditActions.Login, AuditEntityTypes.User, user.Id,
            $"{user.Name} loggade in."));

        await refreshTokenRepository.SaveChangesAsync();
        return session;
    }

    /// <summary>
    /// Exchanges a refresh token for a new access token and a new refresh token
    /// (rotation). A token that was already used is treated as stolen: the whole
    /// token family is revoked.
    /// </summary>
    public async Task<AuthSession> RefreshAsync(string? refreshToken, string? ipAddress)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new InvalidRefreshTokenException("no refresh token");
        }

        var now = DateTime.UtcNow;
        var stored = await refreshTokenRepository.GetByHashAsync(Hash(refreshToken));

        if (stored is null)
        {
            throw new InvalidRefreshTokenException("unknown token");
        }

        if (stored.RevokedAt is not null)
        {
            await refreshTokenRepository.RevokeFamilyAsync(stored.FamilyId, now);
            await refreshTokenRepository.SaveChangesAsync();
            throw new InvalidRefreshTokenException($"reuse of revoked token in family {stored.FamilyId}");
        }

        if (stored.ExpiresAt <= now)
        {
            throw new InvalidRefreshTokenException("expired token");
        }

        var user = stored.User;
        if (user is null || !user.IsActive)
        {
            await refreshTokenRepository.RevokeFamilyAsync(stored.FamilyId, now);
            await refreshTokenRepository.SaveChangesAsync();
            throw new InvalidRefreshTokenException("user missing or deactivated");
        }

        var session = IssueSession(user, stored.FamilyId, ipAddress);

        stored.RevokedAt = now;
        stored.ReplacedByTokenHash = Hash(session.RefreshToken);

        await refreshTokenRepository.SaveChangesAsync();
        return session;
    }

    /// <summary>Ends the session that owns this refresh token. Unknown tokens are ignored.</summary>
    public async Task LogoutAsync(string? refreshToken)
    {
        if (string.IsNullOrWhiteSpace(refreshToken))
        {
            return;
        }

        var stored = await refreshTokenRepository.GetByHashAsync(Hash(refreshToken));
        if (stored is null)
        {
            return;
        }

        await refreshTokenRepository.RevokeFamilyAsync(stored.FamilyId, DateTime.UtcNow);

        if (stored.User is { } user)
        {
            userRepository.AddAuditEntry(Audit.Entry(
                user.TenantId, user.Id, AuditActions.Logout, AuditEntityTypes.User, user.Id,
                $"{user.Name} loggade ut."));
        }

        await refreshTokenRepository.SaveChangesAsync();
    }

    public async Task<AuthenticatedUserDto> GetCurrentUserAsync(int userId, int tenantId)
    {
        var user = await userRepository.GetInTenantAsync(userId, tenantId);

        if (user is null || !user.IsActive)
        {
            throw new InvalidRefreshTokenException("user missing or deactivated");
        }

        return ToDto(user);
    }

    public async Task ChangePasswordAsync(int userId, int tenantId, string? currentPassword, string? newPassword)
    {
        var user = await userRepository.GetInTenantAsync(userId, tenantId)
            ?? throw new UserNotFoundException(userId);

        if (string.IsNullOrEmpty(currentPassword) || user.PasswordHash is null ||
            !passwordHasher.VerifyPassword(currentPassword, user.PasswordHash))
        {
            throw new WrongCurrentPasswordException();
        }

        EnsureStrongPassword(newPassword);

        user.PasswordHash = passwordHasher.HashPassword(newPassword!);

        userRepository.AddAuditEntry(Audit.Entry(
            user.TenantId, user.Id, AuditActions.PasswordChanged, AuditEntityTypes.User, user.Id,
            $"{user.Name} bytte lösenord."));

        await userRepository.SaveChangesAsync();
    }

    public static void EnsureStrongPassword(string? password)
    {
        if (string.IsNullOrWhiteSpace(password) || password.Length < MinimumPasswordLength)
        {
            throw new WeakPasswordException(MinimumPasswordLength);
        }
    }

    public static AuthenticatedUserDto ToDto(User user) => new()
    {
        Id = user.Id,
        Name = user.Name,
        Email = user.Email,
        Role = user.Role,
        TenantId = user.TenantId,
        TenantName = user.Tenant?.Name
    };

    private AuthSession IssueSession(User user, Guid familyId, string? ipAddress)
    {
        var (accessToken, expiresAt) = jwtTokenService.CreateAccessToken(
            user.Id, user.TenantId, user.Email, user.Role, user.Name);

        var refreshToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
        var refreshExpiresAt = DateTime.UtcNow.Add(jwtSettings.RefreshTokenLifetime);

        refreshTokenRepository.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = Hash(refreshToken),
            FamilyId = familyId,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = refreshExpiresAt,
            CreatedByIp = ipAddress
        });

        var response = new LoginResponse
        {
            AccessToken = accessToken,
            ExpiresAt = expiresAt,
            User = ToDto(user)
        };

        return new AuthSession(response, refreshToken, refreshExpiresAt);
    }

    /// <summary>Only the SHA-256 of a refresh token is stored, so a database leak does not leak sessions.</summary>
    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}
