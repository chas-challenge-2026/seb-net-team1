namespace SebPortal.Api.Signing;

/// <summary>
/// NOT real tamper-evidence, deliberately. This does no scrambling or hashing
/// at all, it just stores the text itself as its own "signature". Any change to
/// the text is then an obvious mismatch, which is in my opinion enough to test
/// AuditService's chaining, locking, and pagination without needing to touch
/// any cryptography at all.
///
/// Its only job is to unblock everything that doesn't need real signing yet,
/// while Emil's part is still being built.
/// Will swap the registration in Program.cs for his implementation once it's ready.
/// </summary>
public class UnsignedPlaceholderAuditSigner : IAuditSigner
{
    public string Sign(string canonicalJson) => canonicalJson;

    public bool Verify(string canonicalJson, string signature) => canonicalJson == signature;
}