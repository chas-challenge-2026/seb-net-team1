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
    /// Seeds the users and account required to create a payment through the API.
    /// The payment and approval step are intentionally created by the tested flow.
    /// </summary>
    private static async Task SeedPaymentCreationScenarioAsync(
        ApprovalApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();

        var db = scope.ServiceProvider
            .GetRequiredService<SebDbContext>();

        db.Tenants.Add(new Tenant
        {
            Id = TenantId,
            Name = "Malmö Bygg AB"
        });

        db.Users.AddRange(
            new User
            {
                Id = InitiatorId,
                TenantId = TenantId,
                Name = "Lisa Persson",
                Email = "lisa@malmobygg.se",
                Role = UserRoles.Initiator
            },
            new User
            {
                Id = AttestantId,
                TenantId = TenantId,
                Name = "Johan Berg",
                Email = "johan@malmobygg.se",
                Role = UserRoles.Attestant
            });

        db.Accounts.Add(new Account
        {
            Id = AccountId,
            TenantId = TenantId,
            AccountName = "Driftkonto",
            Iban = "SE4550000000058398257466",
            Balance = 500000m,
            Currency = "SEK"
        });

        await db.SaveChangesAsync();
    }

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
            PublicId = TestIds.Step(501),
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

    /// <summary>
    /// Verifies the complete lifecycle from creating a payment that requires
    /// approval to displaying it in the assigned attestant's inbox.
    /// </summary>
    [Fact]
    public async Task CreatePayment_WhenApprovalIsRequired_AppearsInAttestantsInbox()
    {
        using var factory = new ApprovalApiFactory();

        await SeedPaymentCreationScenarioAsync(factory);

        var initiatorClient = CreateClient(
            factory,
            userId: InitiatorId,
            role: UserRoles.Initiator);

        var createResponse = await initiatorClient.PostAsJsonAsync(
            "/api/payments",
            new CreatePaymentRequestDto
            {
                FromAccountId = AccountId,
                ToIban = "SE8550000000054910000004",
                Amount = 75000m,
                Reference = "Faktura #1043"
            });

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);

        var attestantClient = CreateClient(factory);

        var inboxResponse = await attestantClient.GetAsync("/api/approvals");

        Assert.Equal(HttpStatusCode.OK, inboxResponse.StatusCode);

        var inbox = await inboxResponse.Content
            .ReadFromJsonAsync<ApprovalInboxResponse>();

        Assert.NotNull(inbox);

        var pending = Assert.Single(inbox!.Pending);

        Assert.Equal("75000.00", pending.Amount);
        Assert.Equal("Lisa Persson", pending.CreatedByName);
        Assert.Equal("Driftkonto", pending.FromAccountName);
        Assert.Equal(1, pending.CurrentStep);
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
        Assert.Equal(TestIds.Step(501), pending.ApprovalStepId);
        Assert.Equal("75000.00", pending.Amount);
        Assert.Equal("Lisa Persson", pending.CreatedByName);
        Assert.Equal("Driftkonto", pending.FromAccountName);
        Assert.False(pending.RequiresDoubleApproval);
        Assert.Empty(inbox.RecentlyHandled);
    }

    [Fact]
    public async Task GetApprovals_SerializesAllAttestantsInStepOrderIncludingUnassignedSteps()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            db.ApprovalSteps.AddRange(
                new ApprovalStep
                {
                    Id = 503, PublicId = TestIds.Step(503), PaymentId = 42,
                    AttestantId = null, StepNumber = 3
                },
                new ApprovalStep
                {
                    Id = 502, PublicId = TestIds.Step(502), PaymentId = 42,
                    AttestantId = OtherAttestantId, StepNumber = 2
                });
            await db.SaveChangesAsync();
        }

        var client = CreateClient(factory);
        var response = await client.GetAsync("/api/approvals");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var pending = Assert.Single(body.RootElement.GetProperty("pending").EnumerateArray());
        var attestants = pending.GetProperty("attestants").EnumerateArray().ToArray();

        Assert.Equal("Lisa Persson", pending.GetProperty("createdByName").GetString());
        Assert.Equal("SE8550000000054910000004", pending.GetProperty("toIban").GetString());
        Assert.Equal("75000.00", pending.GetProperty("amount").GetString());
        Assert.Equal("Faktura #1043", pending.GetProperty("reference").GetString());
        Assert.Equal(new[] { 1, 2, 3 }, attestants.Select(a => a.GetProperty("stepNumber").GetInt32()));
        Assert.Equal("Johan Berg", attestants[0].GetProperty("name").GetString());
        Assert.Equal("Eva Nord", attestants[1].GetProperty("name").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, attestants[2].GetProperty("name").ValueKind);
        Assert.All(attestants, attestant => Assert.Equal(
            new[] { "name", "stepNumber" },
            attestant.EnumerateObject().Select(property => property.Name).OrderBy(name => name)));
    }

    [Fact]
    public async Task GetApprovals_WithAttestantDetails_PreservesAssignmentAndTenantIsolation()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            db.Tenants.Add(new Tenant { Id = 2, Name = "Annat Bolag AB" });
            db.Users.Add(new User
            {
                Id = 22, TenantId = 2, Name = "Vera Secret", Role = UserRoles.Initiator
            });
            db.Payments.AddRange(
                new Payment
                {
                    Id = 43, TenantId = TenantId, FromAccountId = AccountId,
                    CreatedById = InitiatorId, Amount = 75000m
                },
                new Payment
                {
                    Id = 44, TenantId = 2, FromAccountId = AccountId,
                    CreatedById = 22, Amount = 75000m
                });
            db.ApprovalSteps.AddRange(
                new ApprovalStep
                {
                    Id = 502, PublicId = TestIds.Step(502), PaymentId = 43,
                    AttestantId = OtherAttestantId
                },
                new ApprovalStep
                {
                    Id = 503, PublicId = TestIds.Step(503), PaymentId = 44,
                    AttestantId = AttestantId
                });
            await db.SaveChangesAsync();
        }

        var attestantClient = CreateClient(factory);
        var attestantResponse = await attestantClient.GetAsync("/api/approvals");
        Assert.Equal(HttpStatusCode.OK, attestantResponse.StatusCode);
        var attestantInbox = await attestantResponse.Content.ReadFromJsonAsync<ApprovalInboxResponse>();
        Assert.NotNull(attestantInbox);
        var pending = Assert.Single(attestantInbox.Pending);
        Assert.Equal(42, pending.PaymentId);
        Assert.Equal("Johan Berg", Assert.Single(pending.Attestants).Name);
        Assert.Equal(TestIds.Step(501), Assert.Single(pending.Timeline).ApprovalStepId);

        var adminClient = CreateClient(factory, role: UserRoles.Admin);
        var adminResponse = await adminClient.GetAsync("/api/approvals");
        Assert.Equal(HttpStatusCode.OK, adminResponse.StatusCode);
        var adminInbox = await adminResponse.Content.ReadFromJsonAsync<ApprovalInboxResponse>();
        Assert.NotNull(adminInbox);
        Assert.Equal(new[] { 42, 43 }, adminInbox.Pending.Select(item => item.PaymentId).OrderBy(id => id));
        Assert.DoesNotContain(adminInbox.Pending, item => item.CreatedByName == "Vera Secret");
        Assert.DoesNotContain(adminInbox.Pending.SelectMany(item => item.Timeline),
            step => step.ApprovalStepId == TestIds.Step(503));
    }

    [Fact]
    public async Task GetApprovals_AfterApprovalSerializesFullTimelineForHandledAndNextPendingStep()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            db.ApprovalSteps.Add(new ApprovalStep
            {
                Id = 502, PublicId = TestIds.Step(502), PaymentId = 42,
                AttestantId = OtherAttestantId, StepNumber = 2
            });
            await db.SaveChangesAsync();
        }
        var actorClient = CreateClient(factory);
        var decisionResponse = await actorClient.PostAsJsonAsync(
            $"/api/approvals/{TestIds.Step(501)}/decision",
            new ApprovalDecisionRequestDto { Action = "approve", Comment = "Granskat ärende" });
        Assert.Equal(HttpStatusCode.OK, decisionResponse.StatusCode);

        var actorResponse = await actorClient.GetAsync("/api/approvals");
        Assert.Equal(HttpStatusCode.OK, actorResponse.StatusCode);
        using var actorBody = System.Text.Json.JsonDocument.Parse(await actorResponse.Content.ReadAsStringAsync());
        Assert.Empty(actorBody.RootElement.GetProperty("pending").EnumerateArray());
        var handled = Assert.Single(actorBody.RootElement.GetProperty("recentlyHandled").EnumerateArray());
        Assert.Equal("manual", handled.GetProperty("decisionSource").GetString());
        var actorTimeline = handled.GetProperty("timeline").EnumerateArray().ToArray();

        var nextClient = CreateClient(factory, userId: OtherAttestantId);
        var nextResponse = await nextClient.GetAsync("/api/approvals");
        Assert.Equal(HttpStatusCode.OK, nextResponse.StatusCode);
        using var nextBody = System.Text.Json.JsonDocument.Parse(await nextResponse.Content.ReadAsStringAsync());
        var nextPending = Assert.Single(nextBody.RootElement.GetProperty("pending").EnumerateArray());
        var nextTimeline = nextPending.GetProperty("timeline").EnumerateArray().ToArray();
        Assert.Equal(2, nextTimeline.Length);
        Assert.Equal(new[] { 1, 2 }, nextTimeline.Select(step => step.GetProperty("stepNumber").GetInt32()));
        Assert.Equal(actorTimeline.Select(step => step.GetRawText()), nextTimeline.Select(step => step.GetRawText()));
        Assert.All(nextTimeline, step => Assert.Equal(
            new[] { "approvalStepId", "attestantName", "comment", "decidedAt", "decidedByName", "decisionSource", "status", "stepNumber" },
            step.EnumerateObject().Select(property => property.Name).OrderBy(name => name)));

        Assert.Equal(TestIds.Step(501), nextTimeline[0].GetProperty("approvalStepId").GetGuid());
        Assert.Equal("approved", nextTimeline[0].GetProperty("status").GetString());
        Assert.Equal("Johan Berg", nextTimeline[0].GetProperty("attestantName").GetString());
        Assert.Equal("Johan Berg", nextTimeline[0].GetProperty("decidedByName").GetString());
        Assert.Equal("manual", nextTimeline[0].GetProperty("decisionSource").GetString());
        Assert.Equal("Granskat ärende", nextTimeline[0].GetProperty("comment").GetString());
        Assert.Equal(DateTimeKind.Utc, nextTimeline[0].GetProperty("decidedAt").GetDateTime().Kind);
        Assert.Equal("pending", nextTimeline[1].GetProperty("status").GetString());
        Assert.Equal("Eva Nord", nextTimeline[1].GetProperty("attestantName").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, nextTimeline[1].GetProperty("decidedByName").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, nextTimeline[1].GetProperty("decidedAt").ValueKind);
    }

    [Fact]
    public async Task GetApprovals_AfterRejectionSerializesAutomaticClosureWithoutClaimingAnotherActor()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            db.ApprovalSteps.Add(new ApprovalStep
            {
                Id = 502, PublicId = TestIds.Step(502), PaymentId = 42,
                AttestantId = OtherAttestantId, StepNumber = 2
            });
            await db.SaveChangesAsync();
        }
        var actorClient = CreateClient(factory);
        var decisionResponse = await actorClient.PostAsJsonAsync(
            $"/api/approvals/{TestIds.Step(501)}/decision",
            new ApprovalDecisionRequestDto { Action = "reject", Comment = "Fel mottagare" });
        Assert.Equal(HttpStatusCode.OK, decisionResponse.StatusCode);

        var otherClient = CreateClient(factory, userId: OtherAttestantId);
        var response = await otherClient.GetAsync("/api/approvals");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var inbox = await response.Content.ReadFromJsonAsync<ApprovalInboxResponse>();
        Assert.NotNull(inbox);
        Assert.Empty(inbox.Pending);
        var stopped = Assert.Single(inbox.RecentlyHandled);
        Assert.Equal("payment_rejected", stopped.DecisionSource);
        var manual = stopped.Timeline[0];
        var automatic = stopped.Timeline[1];
        Assert.Equal("Johan Berg", manual.DecidedByName);
        Assert.Equal("manual", manual.DecisionSource);
        Assert.Equal("Fel mottagare", manual.Comment);
        Assert.Equal("Eva Nord", automatic.AttestantName);
        Assert.Equal("rejected", automatic.Status);
        Assert.Equal("payment_rejected", automatic.DecisionSource);
        Assert.Null(automatic.DecidedByName);
        Assert.Null(automatic.Comment);
        Assert.NotNull(automatic.DecidedAt);
    }

    [Fact]
    public async Task GetApprovals_LegacyTimelineKeepsUnknownActorAndUnassignedAttestantNull()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);
        var legacyDecisionAt = new DateTime(2026, 8, 29, 12, 0, 0, DateTimeKind.Utc);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            db.ApprovalSteps.AddRange(
                new ApprovalStep
                {
                    Id = 502, PublicId = TestIds.Step(502), PaymentId = 42,
                    AttestantId = OtherAttestantId, StepNumber = 2,
                    Status = ApprovalStatuses.Approved, DecidedAt = legacyDecisionAt
                },
                new ApprovalStep
                {
                    Id = 503, PublicId = TestIds.Step(503), PaymentId = 42,
                    AttestantId = null, StepNumber = 3
                });
            await db.SaveChangesAsync();
        }

        var response = await CreateClient(factory).GetAsync("/api/approvals");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var pending = Assert.Single(body.RootElement.GetProperty("pending").EnumerateArray());
        var timeline = pending.GetProperty("timeline").EnumerateArray().ToArray();
        Assert.Equal(new[] { 1, 2, 3 }, timeline.Select(step => step.GetProperty("stepNumber").GetInt32()));
        Assert.Equal("approved", timeline[1].GetProperty("status").GetString());
        Assert.Equal("Eva Nord", timeline[1].GetProperty("attestantName").GetString());
        Assert.Equal(legacyDecisionAt, timeline[1].GetProperty("decidedAt").GetDateTime());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, timeline[1].GetProperty("decidedByName").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, timeline[1].GetProperty("decisionSource").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, timeline[2].GetProperty("attestantName").ValueKind);
        Assert.Equal(System.Text.Json.JsonValueKind.Null, timeline[2].GetProperty("decidedByName").ValueKind);
    }

    [Fact]
    public async Task GetApprovals_PostgresUnspecifiedDecisionTimeSerializesWithUtcSuffixInHistoryAndTimeline()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory, stepStatus: ApprovalStatuses.Approved);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            var step = await db.ApprovalSteps.FindAsync(501);
            Assert.NotNull(step);
            step.DecidedAt = new DateTime(2026, 10, 8, 12, 30, 0, DateTimeKind.Unspecified);
            await db.SaveChangesAsync();
        }

        var response = await CreateClient(factory).GetAsync("/api/approvals");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var handled = Assert.Single(body.RootElement.GetProperty("recentlyHandled").EnumerateArray());
        var timeline = Assert.Single(handled.GetProperty("timeline").EnumerateArray());
        Assert.Equal("2026-10-08T12:30:00Z", handled.GetProperty("decidedAt").GetString());
        Assert.Equal("2026-10-08T12:30:00Z", timeline.GetProperty("decidedAt").GetString());
        Assert.Equal(DateTimeKind.Utc, handled.GetProperty("decidedAt").GetDateTime().Kind);
        Assert.Equal(DateTimeKind.Utc, timeline.GetProperty("decidedAt").GetDateTime().Kind);
    }

    [Fact]
    public async Task PostDecision_Approve_ReturnsOkAndCompletesPayment()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        var client = CreateClient(factory);

        var response = await client.PostAsJsonAsync(
            $"/api/approvals/{TestIds.Step(501)}/decision",
            new ApprovalDecisionRequestDto { Action = "approve", Comment = "Ser korrekt ut" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var decision = await response.Content.ReadFromJsonAsync<ApprovalDecisionResponseDto>();

        Assert.NotNull(decision);
        Assert.Equal(42, decision!.PaymentId);
        Assert.Equal(TestIds.Step(501), decision.ApprovalStepId);
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
            $"/api/approvals/{TestIds.Step(501)}/decision",
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
            $"/api/approvals/{TestIds.Step(501)}/decision",
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
            $"/api/approvals/{TestIds.Step(999)}/decision",
            new ApprovalDecisionRequestDto { Action = "approve" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PostDecision_WithTheOldNumericId_IsNotFound()
    {
        // Steps used to be addressed by their counter (501). Only the public Guid works now.
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        var client = CreateClient(factory);

        var response = await client.PostAsJsonAsync(
            "/api/approvals/501/decision",
            new ApprovalDecisionRequestDto { Action = "approve" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetApprovals_SendsTheStepIdAsAGuidString_NotAsTheCounter()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory);

        var client = CreateClient(factory);

        var response = await client.GetAsync("/api/approvals");
        using var body = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        var stepId = body.RootElement.GetProperty("pending")[0].GetProperty("approvalStepId");
        Assert.Equal(System.Text.Json.JsonValueKind.String, stepId.ValueKind);
        Assert.Equal(TestIds.Step(501), Guid.Parse(stepId.GetString()!));
    }

    [Fact]
    public async Task PostDecision_OnAlreadyDecidedStep_ReturnsConflict()
    {
        using var factory = new ApprovalApiFactory();
        await SeedApprovalScenarioAsync(factory, stepStatus: ApprovalStatuses.Approved);

        var client = CreateClient(factory);

        var response = await client.PostAsJsonAsync(
            $"/api/approvals/{TestIds.Step(501)}/decision",
            new ApprovalDecisionRequestDto { Action = "approve" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal("Det här atteststeget är redan hanterat.", problem!.Detail);
    }
}
