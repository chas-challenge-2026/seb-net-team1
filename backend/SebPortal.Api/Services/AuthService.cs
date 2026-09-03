using SebPortal.Api.DTOs;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class AuthService(UserRepository userRepository, PasswordHasher passwordHasher)
{
    /// <summary>
    /// Performs a login request using the provided LoginRequest
    /// </summary>
    /// <returns>A LoginResponse upon success, otherwise null</returns>
    public LoginResponse? Login(LoginRequest request)
    {
        var user = userRepository.GetByEmail(request.Email!);

        if (user is null || user.PasswordHash is null || !passwordHasher.VerifyPassword(request.Password!, user.PasswordHash))
        {
            return null;
        }

        var response = new LoginResponse
        {
            AccessToken = "mock-jwt-token",
            User = new AuthenticatedUserDto
            {
                Id = user.Id,
                Name = user.Name,
                Email = user.Email,
                Role = user.Role,
                TenantId = user.TenantId
            }
        };

        return response;
    }
}
