using SebPortal.Api.Models;

namespace SebPortal.Api.Repositories;

public class UserRepository
{
    public User? GetByEmail(string email)
    {
        if (email != "lisa@malmobygg.se")
        {
            return null;
        }

        return new User
        {
            Id = 1,
            Name = "Lisa Andersson",
            Email = "lisa@malmobygg.se",
            Role = "initiator",
            TenantId = 1,
            PasswordHash = "$2a$11$eyQ2yJDRRPWxS4ZzT.heGuZ9.KxzwNHyrtiHWC2fU0atSb9ucAg.y"
        };

    }
}