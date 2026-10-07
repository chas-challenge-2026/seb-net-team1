using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

public class ApprovalStepTests
{
    [Fact]
    public void NewStep_GetsARandomPublicId()
    {
        var first = new ApprovalStep();
        var second = new ApprovalStep();

        Assert.NotEqual(Guid.Empty, first.PublicId);
        Assert.NotEqual(first.PublicId, second.PublicId);
    }
}