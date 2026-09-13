namespace SebPortal.Api.Services;

public class CompletePaymentResult
{
    public bool WasSuccessful { get; set; }
    public string? ErrorMessage { get; set; }
}