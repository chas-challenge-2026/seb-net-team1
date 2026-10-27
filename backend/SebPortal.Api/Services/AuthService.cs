using System.Security.Cryptography;
using System.Text;
using SebPortal.Api.Auditing;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class AuthService(UserRepository userRepository, PasswordHasher passwordHasher)
{
    /// <summary>
    /// Performs a login request using the provided LoginRequest
    /// </summary>
    /// <returns>The authenticated user upon success, otherwise null</returns>
    public AuthenticatedUserDto? Login(LoginRequest request)
    {
        var user = userRepository.GetByEmail(request.Email!);

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

        return new AuthenticatedUserDto
        {
            Id = user.Id,
            Name = user.Name,
            Email = user.Email,
            Role = user.Role,
            TenantId = user.TenantId
        };
    }

    /// <summary>Only the SHA-256 of a refresh token is stored, so a database leak does not leak sessions.</summary>
    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}
