using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

/// <summary>
/// Drives the approval endpoints through the complete HTTP, JWT and exception
/// handling pipeline: role authorization, the status codes from
/// contracts/approvals-contract.md, and the ProblemDetails body behind them.
/// </summary>
public class ApprovalsApiIntegrationTests
{
    private const int TenantId = 1;
    private const int InitiatorId = 10;
    private const int AttestantId = 20;
    private const int OtherAttestantId = 21;
    private const int AccountId = 100;

    /// <summary>
    /// Seeds a tenant with two attestants, an account and one payment of
    /// 75 000 SEK waiting for <paramref name="assignedAttestantId"/>'s approval.
    /// </summary>
    private static async Task SeedApprovalScenarioAsync(
        ApprovalApiFactory factory,
        int assignedAttestantId = AttestantId,
        string stepStatus = ApprovalStatuses.Pending)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();

        db.Tenants.Add(new Tenant { Id = TenantId, Name = "Malmö Bygg AB" });

        db.Users.AddRange(
            new User { Id = InitiatorId, TenantId = TenantId, Name = "Lisa Persson", Email = "lisa@malmobygg.se", Role = UserRoles.Initiator },
            new User { Id = AttestantId, TenantId = TenantId, Name = "Johan Berg", Email = "johan@malmobygg.se", Role = UserRoles.Attestant },
            new User { Id = OtherAttestantId, TenantId = TenantId, Name = "Eva Nord", Email = "eva@malmobygg.se", Role = UserRoles.Attestant });

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
            CreatedById = InitiatorId,
            CreatedAt = new DateTime(2026, 8, 30, 9, 15, 0, DateTimeKind.Utc)
        });

        db.ApprovalSteps.Add(new ApprovalStep
        {
            Id = 501,
            PaymentId = 42,
            AttestantId = assignedAttestantId,
            StepNumber = 1,
            Status = stepStatus,
            DecidedAt = stepStatus == ApprovalStatuses.Pending ? null : DateTime.UtcNow
        });

        await db.SaveChangesAsync();
    }

    private static HttpClient CreateClient(
        ApprovalApiFactory factory,
        int? userId = AttestantId,
        string role = UserRoles.Attestant)
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });

        if (userId is null)
        {
            return client;
        }

        using var scope = factory.Services.CreateScope();
        var tokenService = scope.ServiceProvider.GetRequiredService<JwtTokenService>();

        var token = tokenService.GenerateToken(
            userId: userId.Value,
            tenantId: TenantId,
            email: "johan@malmobygg.se",
            role: role,
            name: "Johan Berg");

        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);

        return client;
    }

    [Fact]
    public async Task GetApprovals_WithoutToken_ReturnsUnauthorized()
    {
        using var factory = new ApprovalApiFactory();
        var client = CreateClient(factory, userId: null);

        var response = await client.GetAsync("/api/approvals");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    /// <summary>
    /// The attest endpoints are role gated through [Authorize(Roles = ...)] instead
    /// of v1's string comparison against the session (see docs/v2-targets.md).
    /// </summary>
    [Fact]
    public async Task GetApprovals_AsInitiator_ReturnsForbidden()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        var client = CreateClient(factory, userId: InitiatorId, role: UserRoles.Initiator);

        var response = await client.GetAsync("/api/approvals");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task GetApprovals_AsAttestant_ReturnsOwnPendingApprovals()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        var client = CreateClient(factory);

        var response = await client.GetAsync("/api/approvals");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var inbox = await response.Content.ReadFromJsonAsync<ApprovalInboxResponse>();

        Assert.NotNull(inbox);

        var pending = Assert.Single(inbox!.Pending);
        Assert.Equal(42, pending.PaymentId);
        Assert.Equal(501, pending.ApprovalStepId);
        Assert.Equal("75000.00", pending.Amount);
        Assert.Equal("Lisa Persson", pending.CreatedByName);
        Assert.Equal("Driftkonto", pending.FromAccountName);
        Assert.False(pending.RequiresDoubleApproval);
        Assert.Empty(inbox.RecentlyHandled);
    }

    [Fact]
    public async Task PostDecision_Approve_ReturnsOkAndCompletesPayment()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        var client = CreateClient(factory);

        var response = await client.PostAsJsonAsync(
            "/api/approvals/501/decision",
            new ApprovalDecisionRequestDto { Action = "approve", Comment = "Ser korrekt ut" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var decision = await response.Content.ReadFromJsonAsync<ApprovalDecisionResponseDto>();

        Assert.NotNull(decision);
        Assert.Equal(42, decision!.PaymentId);
        Assert.Equal(501, decision.ApprovalStepId);
        Assert.Equal(ApprovalStatuses.Approved, decision.StepStatus);
        Assert.Equal(PaymentStatuses.Completed, decision.PaymentStatus);
    }

    /// <summary>
    /// BUG-011 (IDOR) over the wire: the step id is accepted from the client, but
    /// the attestant behind the token still has to own it.
    /// </summary>
    [Fact]
    public async Task PostDecision_OnAnotherAttestantsStep_ReturnsForbiddenProblemDetails()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory, assignedAttestantId: OtherAttestantId);

        var client = CreateClient(factory);

        var response = await client.PostAsJsonAsync(
            "/api/approvals/501/decision",
            new ApprovalDecisionRequestDto { Action = "approve" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal((int)HttpStatusCode.Forbidden, problem!.Status);
        Assert.Equal("Du har inte behörighet till detta atteststeg.", problem.Detail);
    }

    [Fact]
    public async Task PostDecision_WithUnknownAction_ReturnsBadRequestProblemDetails()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        var client = CreateClient(factory);

        var response = await client.PostAsJsonAsync(
            "/api/approvals/501/decision",
            new ApprovalDecisionRequestDto { Action = "delete" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal("Ogiltig åtgärd.", problem!.Detail);
    }

    [Fact]
    public async Task PostDecision_OnUnknownStep_ReturnsNotFound()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        var client = CreateClient(factory);

        var response = await client.PostAsJsonAsync(
            "/api/approvals/999/decision",
            new ApprovalDecisionRequestDto { Action = "approve" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PostDecision_OnAlreadyDecidedStep_ReturnsConflict()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory, stepStatus: ApprovalStatuses.Approved);

        var client = CreateClient(factory);

        var response = await client.PostAsJsonAsync(
            "/api/approvals/501/decision",
            new ApprovalDecisionRequestDto { Action = "approve" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal("Det här atteststeget är redan hanterat.", problem!.Detail);
    }
}
