namespace SebPortal.Api.Services;

public class PasswordHasher
{
    /// <summary>
    /// Generates a hashed password.
    /// </summary>
    /// <returns></returns>
    public string HashPassword(string password)
    {
        return BCrypt.Net.BCrypt.HashPassword(password);
    }
    /// <summary>
    /// Takes a password and a passwordhash and compares if they match
    /// </summary>
    /// <returns>True if the password matches the provided passwordHash</returns>
    public bool VerifyPassword(string password, string passwordHash)
    {
        return BCrypt.Net.BCrypt.Verify(password, passwordHash);
    }
}