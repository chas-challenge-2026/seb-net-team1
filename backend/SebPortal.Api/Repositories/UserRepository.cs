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
        return _context.Users
            .AsNoTracking()
            .FirstOrDefault(u => u.Email == email);
    }
}