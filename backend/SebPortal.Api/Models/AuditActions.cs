namespace SebPortal.Api.Models;

/// <summary>The audit log action names. The frontend maps these to Swedish labels.</summary>
public static class AuditActions
{
    public const string Login = "LOGIN";
    public const string Logout = "LOGOUT";
    public const string CreatePayment = "CREATE_PAYMENT";
    public const string ApprovePaymentStep = "APPROVE_PAYMENT_STEP";
    public const string ApprovePayment = "APPROVE_PAYMENT";
    public const string RejectPayment = "REJECT_PAYMENT";
    public const string BatchUpload = "BATCH_UPLOAD";
    public const string UserCreated = "USER_CREATED";
    public const string UserUpdated = "USER_UPDATED";
    public const string PasswordChanged = "PASSWORD_CHANGED";
    public const string PasswordReset = "PASSWORD_RESET";
}

public static class AuditEntityTypes
{
    public const string Payment = "payment";
    public const string User = "user";
    public const string Batch = "batch";
}
