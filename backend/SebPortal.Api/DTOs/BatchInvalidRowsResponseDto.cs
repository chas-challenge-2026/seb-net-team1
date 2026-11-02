namespace SebPortal.Api.DTOs;

/// <summary>
/// Batch outcome when the file parsed but some rows are invalid. Nothing was created.
/// Only the invalid rows are listed.
/// </summary>
public class BatchInvalidRowsResponseDto
{
    public bool Processed => false;
    public bool Parsed => true;
    public string Message { get; set; } = string.Empty;
    public int TotalRows { get; set; }
    public int InvalidRows { get; set; }
    public List<BatchRowErrorDto> Rows { get; set; } = [];
}
