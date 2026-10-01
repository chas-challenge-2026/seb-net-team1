namespace SebPortal.Api.Signing;

/// <summary>
/// Signs and verifies the text built by AuditSigningFormat. UnsignedPlaceholderAuditSigner stands in for it
/// until then, it is NOT the real algorithm, just something that unblocks
/// everything else, so this feature can be built and tested today and the real
/// signer dropped in later with no other code change, everything here already
/// calls this interface.
/// </summary>
public interface IAuditSigner
{
	string Sign(string canonicalJson);

	bool Verify(string canonicalJson, string signature);
}