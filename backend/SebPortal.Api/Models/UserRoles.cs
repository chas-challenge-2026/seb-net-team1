namespace SebPortal.Api.Models;

/// <summary>
/// The roles a <see cref="User"/> can have. Matches the users.role column.
/// Used for [Authorize(Roles = ...)] instead of v1's ad hoc string comparisons
/// against the session (see docs/v2-targets.md).
/// </summary>
public static class UserRoles
{
    public const string Initiator = "initiator";
    public const string Attestant = "attestant";
    public const string Admin = "admin";

    /// <summary>Roles allowed to view the approval inbox and decide approval steps.</summary>
    public const string ApproverRoles = $"{Attestant},{Admin}";

    /// <summary>Roles allowed to create payments. An attestant only approves, never creates.</summary>
    public const string CreatorRoles = $"{Initiator},{Admin}";
}