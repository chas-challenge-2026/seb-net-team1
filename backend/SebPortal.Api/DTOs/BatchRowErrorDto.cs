namespace SebPortal.Api.DTOs;

public class BatchRowErrorDto
{
    /// <summary>Row number in the uploaded file, where the header is row 1.</summary>
    public int RowNumber { get; set; }
    /// <summary>The row rebuilt from the parsed fields, so the user can see what the server read.</summary>
    public string Content { get; set; } = string.Empty;
    /// <summary>User-facing message about what's wrong with the row.</summary>
    public string Error { get; set; } = string.Empty;
}
