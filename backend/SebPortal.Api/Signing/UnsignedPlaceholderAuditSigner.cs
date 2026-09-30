namespace SebPortal.Api.Signing;

/// <summary>
/// NOT real tamper-evidence!!!  This does no scrambling or hashing
/// at all. It returns the same fixed marker for every entry, so nothing here can
/// be mistaken for a working signature.
///
/// Why not return the text itself: each entry's text contains the previous
/// entry's signature, so a signature that is the whole text makes every entry
/// roughly twice as long as the one before it. Entry number 24 for a tenant
/// then exceeds the JSON size limit and throws.
///
/// Its only job is to unblock everything that doesn't need real signing yet,
/// while Emil's part is still being built.
/// Will swap the registration in Program.cs for his implementation once it's ready.
/// </summary>
public class UnsignedPlaceholderAuditSigner : IAuditSigner
{
    public const string Marker = "UNSIGNED";

    public string Sign(string canonicalJson) => Marker;

    public bool Verify(string canonicalJson, string signature) => signature == Marker;
}