using System.Net.Mail;
using SebPortal.Api.Auditing;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

/// <summary>User administration for tenant admins.</summary>
public class UserService(
    UserRepository userRepository,
    RefreshTokenRepository refreshTokenRepository,
    PasswordHasher passwordHasher,
    UnitOfWork unitOfWork)
{
    private static readonly string[] Roles = [UserRoles.Initiator, UserRoles.Attestant, UserRoles.Admin];

    public async Task<List<UserAdminDto>> GetUsersAsync(int tenantId)
    {
        var users = await userRepository.GetAllInTenantAsync(tenantId);
        return users.Select(ToDto).ToList();
    }

    /// <summary>
    /// Creates a user with a BCrypt hashed password (never stored in plain text or
    /// MD5 as in v1, BUG-002).
    /// </summary>
    public async Task<UserAdminDto> CreateUserAsync(int tenantId, int createdByUserId, CreateUserRequest request)
    {
        var name = RequireName(request.Name);
        var email = RequireEmail(request.Email);
        var role = RequireRole(request.Role);
        AuthService.EnsureStrongPassword(request.Password);

        if (await userRepository.EmailExistsAsync(email))
        {
            throw new EmailAlreadyInUseException(email);
        }

        var user = new User
        {
            TenantId = tenantId,
            Name = name,
            Email = email,
            Role = role,
            PasswordHash = passwordHasher.HashPassword(request.Password!),
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        await unitOfWork.RunAsync(tenantId, async () =>
        {
            userRepository.Add(user);
            await userRepository.SaveChangesAsync();

            userRepository.AddAuditEntry(Audit.Entry(
                tenantId, createdByUserId, AuditActions.UserCreated, AuditEntityTypes.User, user.Id,
                $"Användaren {user.Name} ({user.Email}) skapades med rollen {RoleLabel(role)}."));
            await userRepository.SaveChangesAsync();
            return user;
        });

        return ToDto(user);
    }

    public async Task<UserAdminDto> UpdateUserAsync(int tenantId, int adminUserId, int userId, UpdateUserRequest request)
    {
        var user = await userRepository.GetInTenantAsync(userId, tenantId)
            ?? throw new UserNotFoundException(userId);

        var name = RequireName(request.Name);
        var role = RequireRole(request.Role);

        // An admin locking themselves out would leave the tenant without an admin.
        if (userId == adminUserId && (role != UserRoles.Admin || !request.IsActive))
        {
            throw new CannotChangeOwnAccessException();
        }

        var changes = new List<string>();
        if (user.Name != name) changes.Add($"namn till {name}");
        if (user.Role != role) changes.Add($"roll till {RoleLabel(role)}");
        if (user.IsActive != request.IsActive) changes.Add(request.IsActive ? "aktiverad" : "inaktiverad");

        user.Name = name;
        user.Role = role;
        user.IsActive = request.IsActive;

        if (!request.IsActive)
        {
            await refreshTokenRepository.RevokeAllForUserAsync(user.Id, DateTime.UtcNow);
        }

        if (changes.Count > 0)
        {
            userRepository.AddAuditEntry(Audit.Entry(
                tenantId, adminUserId, AuditActions.UserUpdated, AuditEntityTypes.User, user.Id,
                $"Användaren {user.Email} ändrades: {string.Join(", ", changes)}."));
        }

        await userRepository.SaveChangesAsync();
        return ToDto(user);
    }

    public async Task ResetPasswordAsync(int tenantId, int adminUserId, int userId, string? newPassword)
    {
        var user = await userRepository.GetInTenantAsync(userId, tenantId)
            ?? throw new UserNotFoundException(userId);

        AuthService.EnsureStrongPassword(newPassword);

        user.PasswordHash = passwordHasher.HashPassword(newPassword!);
        await refreshTokenRepository.RevokeAllForUserAsync(user.Id, DateTime.UtcNow);

        userRepository.AddAuditEntry(Audit.Entry(
            tenantId, adminUserId, AuditActions.PasswordReset, AuditEntityTypes.User, user.Id,
            $"Lösenordet för {user.Email} återställdes av en administratör."));

        await userRepository.SaveChangesAsync();
    }

    public static UserAdminDto ToDto(User user) => new()
    {
        Id = user.Id,
        Name = user.Name,
        Email = user.Email,
        Role = user.Role,
        IsActive = user.IsActive,
        CreatedAt = user.CreatedAt
    };

    public static string RoleLabel(string role) => role switch
    {
        UserRoles.Initiator => "initierare",
        UserRoles.Attestant => "attestant",
        UserRoles.Admin => "administratör",
        _ => role
    };

    private static string RequireName(string? name)
    {
        var trimmed = name?.Trim() ?? string.Empty;
        if (trimmed.Length is < 2 or > 100)
        {
            throw new InvalidUserDataException("Namnet måste vara mellan 2 och 100 tecken.");
        }
        return trimmed;
    }

    private static string RequireEmail(string? email)
    {
        var normalized = UserRepository.NormalizeEmail(email ?? string.Empty);
        if (normalized.Length > 100 || !MailAddress.TryCreate(normalized, out var parsed) || parsed.Address != normalized)
        {
            throw new InvalidUserDataException("Ange en giltig e-postadress.");
        }
        return normalized;
    }

    private static string RequireRole(string? role)
    {
        var normalized = role?.Trim().ToLowerInvariant();
        if (normalized is null || !Roles.Contains(normalized))
        {
            throw new InvalidUserDataException("Rollen måste vara initiator, attestant eller admin.");
        }
        return normalized;
    }
}
