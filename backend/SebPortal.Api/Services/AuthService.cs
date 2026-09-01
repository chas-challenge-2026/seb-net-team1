using SebPortal.Api.DTOs;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class AuthService(UserRepository userRepository)
{
    public LoginResponse? Login(LoginRequest request) // Tar in LoginRequest från Frontend (? betyder = antingen så lyckas login eller missluyckas den)
    {
        var user = userRepository.GetByEmail(request.Email!);

        if (user is null || request.Password != "password123")
        {
            return null;
        }

        var response = new LoginResponse
        {
            AccessToken = "mock-jwt-token",
            User = user
        };

        return response;
    }
}
