using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Controllers;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;
using SebPortal.Api.Options;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;

namespace SebPortal.Api.Tests;

/// <summary>
/// Tests the US-25 approval endpoints at the controller level: that the caller's
/// identity is read from the token claims and nothing else, and that a token
/// missing that information is turned away.
/// </summary>
public class ApprovalsControllerTests
{
    private const int TenantId = 1;
    private const int AttestantId = 20;
    private const int OtherAttestantId = 21;
    private const int AdminId = 30;
    private const int AccountId = 100;

    private static SebDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        return new SebDbContext(options);
    }

    private static ApprovalsController CreateController(SebDbContext db)
    {
        var paymentRules = Microsoft.Extensions.Options.Options.Create(
            new PaymentRulesOptions
            {
                ApprovalThreshold = 50000m,
                DoubleApprovalThreshold = 200000m
            });

        var paymentService = new PaymentService(new PaymentRepository(db), paymentRules);

        return new ApprovalsController(
            new ApprovalService(new ApprovalRepository(db), paymentService));
    }

    /// <summary>
    /// Puts the claims a JWT would carry on the controller, so the test exercises
    /// the same reads the controller does after authentication.
    /// </summary>
    private static void SetAuthenticatedUser(
        ApprovalsController controller,
        int? userId = AttestantId,
        int? tenantId = TenantId,
        string role = UserRoles.Attestant)
    {
        var claims = new List<Claim> { new(ClaimTypes.Role, role) };

        if (userId is not null)
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Sub, userId.Value.ToString()));
        }

        if (tenantId is not null)
        {
            claims.Add(new Claim("tenantId", tenantId.Value.ToString()));
        }

        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"))
            }
        };
    }

    /// <summary>Seeds one payment of 75 000 SEK with a single pending step 501.</summary>
    private static void SeedPendingApproval(SebDbContext db, int assignedAttestantId = AttestantId)
    {
        db.Accounts.Add(new Account
        {
            Id = AccountId,
            TenantId = TenantId,
            AccountName = "Driftkonto",
            Iban = "SE4550000000058398257466",
            Balance = 500000m,
            Currency = "SEK"
        });

        db.Payments.Add(new Payment
        {
            Id = 42,
            TenantId = TenantId,
            FromAccountId = AccountId,
            ToIban = "SE8550000000054910000004",
            Amount = 75000m,
            Currency = "SEK",
            Reference = "Faktura #1043",
            Status = PaymentStatuses.PendingApproval,
            CreatedById = 10,
            CreatedAt = new DateTime(2026, 8, 30, 9, 15, 0, DateTimeKind.Utc)
        });

        db.ApprovalSteps.Add(new ApprovalStep
        {
            Id = 501,
            PaymentId = 42,
            AttestantId = assignedAttestantId,
            StepNumber = 1,
            Status = ApprovalStatuses.Pending
        });

        db.SaveChanges();
    }

    private static ApprovalDecisionRequestDto Approve() => new() { Action = "approve" };

    [Fact]
    public async Task GetInbox_WhenTokenHasNoUserId_ReturnsUnauthorized()
    {
        using var db = CreateContext();
        var controller = CreateController(db);
        SetAuthenticatedUser(controller, userId: null);

        var result = await controller.GetInbox();

        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public async Task GetInbox_WhenTokenHasNoTenantId_ReturnsUnauthorized()
    {
        using var db = CreateContext();
        var controller = CreateController(db);
        SetAuthenticatedUser(controller, tenantId: null);

        var result = await controller.GetInbox();

        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public async Task GetInbox_WhenTokenIsComplete_ReturnsOkWithTheCallersOwnSteps()
    {
        using var db = CreateContext();
        SeedPendingApproval(db);

        var controller = CreateController(db);
        SetAuthenticatedUser(controller);

        var result = await controller.GetInbox();

        var ok = Assert.IsType<OkObjectResult>(result);
        var inbox = Assert.IsType<ApprovalInboxResponse>(ok.Value);

        Assert.Equal(501, Assert.Single(inbox.Pending).ApprovalStepId);
    }

    [Fact]
    public async Task Decide_WhenTokenHasNoUserId_ReturnsUnauthorized()
    {
        using var db = CreateContext();
        SeedPendingApproval(db);

        var controller = CreateController(db);
        SetAuthenticatedUser(controller, userId: null);

        var result = await controller.Decide(501, Approve());

        Assert.IsType<UnauthorizedObjectResult>(result);

        var step = await db.ApprovalSteps.FirstAsync(s => s.Id == 501);
        Assert.Equal(ApprovalStatuses.Pending, step.Status);
    }

    [Fact]
    public async Task Decide_WhenTokenIsComplete_ReturnsOkWithTheDecision()
    {
        using var db = CreateContext();
        SeedPendingApproval(db);

        var controller = CreateController(db);
        SetAuthenticatedUser(controller);

        var result = await controller.Decide(501, Approve());

        var ok = Assert.IsType<OkObjectResult>(result);
        var decision = Assert.IsType<ApprovalDecisionResponseDto>(ok.Value);

        Assert.Equal(42, decision.PaymentId);
        Assert.Equal(501, decision.ApprovalStepId);
        Assert.Equal(ApprovalStatuses.Approved, decision.StepStatus);
        Assert.Equal(PaymentStatuses.Completed, decision.PaymentStatus);
    }

    /// <summary>
    /// The step id may come from the client, but the identity behind the decision
    /// comes from the token. A step assigned to someone else is refused (BUG-011).
    /// </summary>
    [Fact]
    public async Task Decide_UsesTheUserIdFromTheToken_NotTheRequestedStepsOwner()
    {
        using var db = CreateContext();
        SeedPendingApproval(db, assignedAttestantId: OtherAttestantId);

        var controller = CreateController(db);
        SetAuthenticatedUser(controller, userId: AttestantId);

        await Assert.ThrowsAsync<ApprovalStepAccessDeniedException>(() =>
            controller.Decide(501, Approve()));
    }

    /// <summary>
    /// The controller has to pass the role claim on, otherwise an admin would be
    /// blocked from steps they are allowed to decide.
    /// </summary>
    [Fact]
    public async Task Decide_PassesTheRoleClaimOn_SoAnAdminMayDecideAnyStepInTheirTenant()
    {
        using var db = CreateContext();
        SeedPendingApproval(db, assignedAttestantId: OtherAttestantId);

        var controller = CreateController(db);
        SetAuthenticatedUser(controller, userId: AdminId, role: UserRoles.Admin);

        var result = await controller.Decide(501, Approve());

        var ok = Assert.IsType<OkObjectResult>(result);
        var decision = Assert.IsType<ApprovalDecisionResponseDto>(ok.Value);

        Assert.Equal(ApprovalStatuses.Approved, decision.StepStatus);
    }
}
