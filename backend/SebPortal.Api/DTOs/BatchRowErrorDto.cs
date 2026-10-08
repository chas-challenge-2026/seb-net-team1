namespace SebPortal.Api.DTOs;

public class BatchRowErrorDto
{
    /// <summary>Line number in the uploaded file, where the header is line 1.</summary>
    public int Row { get; set; }
    public string Field { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}
