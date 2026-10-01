using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
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

        if (user is null || user.PasswordHash is null || !passwordHasher.VerifyPassword(request.Password!, user.PasswordHash))
        {
            return null;
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
}
