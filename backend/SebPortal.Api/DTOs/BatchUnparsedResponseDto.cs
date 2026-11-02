namespace SebPortal.Api.DTOs;

/// <summary>
/// Batch outcome when the file could not be turned into rows, so there is no
/// row-level information to show. Nothing was created.
/// </summary>
public class BatchUnparsedResponseDto
{
    public bool Processed => false;
    public bool Parsed => false;
    public string Message { get; set; } = string.Empty;
}
