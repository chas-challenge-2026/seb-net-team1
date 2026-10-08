namespace SebPortal.Api.DTOs;

/// <summary>The attestant assigned to one payment approval step.</summary>
public class ApprovalAttestantDto
{
    public int StepNumber { get; set; }

    /// <summary>Null when the step has not been assigned to an attestant.</summary>
    public string? Name { get; set; }
}
