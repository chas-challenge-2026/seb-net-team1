using SebPortal.Api.DTOs;

namespace SebPortal.Api.Services;

public class AuthService
{
    public LoginResponse? Login(LoginRequest request) // Tar in LoginRequest från Frontend (? betyder = antingen så lyckas login eller missluyckas den)
    {
        var response = new LoginResponse
        {
            AccessToken = "mock-jwt-token",
            User = new AuthenticatedUserDto
            {
                Id = 1,
                Name = "Lisa Andersson",
                Email = request.Email,
                Role = "initiator",
                TenantId = 1
            }
        };

        return response;
    }
}
