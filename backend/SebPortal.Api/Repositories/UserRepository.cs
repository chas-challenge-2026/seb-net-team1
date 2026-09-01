using SebPortal.Api.DTOs;

namespace SebPortal.Api.Repositories;

public class UserRepository
{
    public AuthenticatedUserDto? GetByEmail(string email)
    {
        if (email != "lisa@malmobygg.se")
        {
            return null;
        }

        return new AuthenticatedUserDto
        {
            Id = 1,
            Name = "Lisa Andersson",
            Email = "lisa@malmobygg.se",
            Role = "initiator",
            TenantId = 1

        };

    }
}