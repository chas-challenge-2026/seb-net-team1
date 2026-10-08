namespace SebPortal.Api.Services;

public enum CompletePaymentFailureReason
{
    WrongAccount,
    AlreadyCompleted,
    InvalidAmount,
    InsufficientFunds
}

public class CompletePaymentResult
{
    public bool WasSuccessful { get; set; }
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// Set whenever WasSuccessful is false. Lets callers map the failure to a
    /// specific exception type without parsing ErrorMessage text.
    /// </summary>
    public CompletePaymentFailureReason? FailureReason { get; set; }
}