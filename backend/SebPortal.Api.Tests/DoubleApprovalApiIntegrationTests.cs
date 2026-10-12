using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SebPortal.Api.Auth;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

public class DoubleApprovalApiIntegrationTests
{
    private const int CreatorId = 10;
    private const int FirstAttestantId = 20;
    private const int SecondAttestantId = 21;
    private const int AdminId = 30;
    private const int AccountId = 100;

    private static async Task SeedAsync(ApprovalApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        db.Tenants.AddRange(
            new Tenant { Id = 1, Name = "Attesttest" },
            new Tenant { Id = 2, Name = "Annan tenant" });
        db.Users.AddRange(
            new User { Id = CreatorId, TenantId = 1, Name = "Lisa", Role = UserRoles.Initiator },
            new User { Id = FirstAttestantId, TenantId = 1, Name = "Johan", Role = UserRoles.Attestant },
            new User { Id = SecondAttestantId, TenantId = 1, Name = "Eva", Role = UserRoles.Attestant },
            new User { Id = AdminId, TenantId = 1, Name = "Sara", Role = UserRoles.Admin },
            new User { Id = 40, TenantId = 2, Name = "Främmande admin", Role = UserRoles.Admin });
        db.Accounts.Add(new Account
        {
            Id = AccountId, TenantId = 1, AccountName = "Attesttestkonto",
            Iban = "SE4550000000058398257466", Currency = "SEK", Balance = 500000m
        });
        await db.SaveChangesAsync();
    }

    private static HttpClient Client(ApprovalApiFactory factory, int userId,
        string role = UserRoles.Attestant, int tenantId = 1)
    {
        var client = factory.CreateClient();
        using var scope = factory.Services.CreateScope();
        var token = scope.ServiceProvider.GetRequiredService<JwtTokenService>()
            .GenerateToken(userId, tenantId, $"user{userId}@example.com", role, $"User {userId}");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    private static async Task<PaymentResponseDto> CreateAsync(ApprovalApiFactory factory, decimal amount)
    {
        using var client = Client(factory, CreatorId, UserRoles.Initiator);
        var response = await client.PostAsJsonAsync("/api/payments", new CreatePaymentRequestDto
        {
            FromAccountId = AccountId, ToIban = "SE8550000000054910000004",
            Amount = amount, Reference = "Två olika attestanter"
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<PaymentResponseDto>())!;
    }

    private static async Task<ApprovalInboxResponse> InboxAsync(HttpClient client)
    {
        var response = await client.GetAsync("/api/approvals");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ApprovalInboxResponse>())!;
    }

    private static Task<HttpResponseMessage> DecideAsync(HttpClient client, Guid stepId, string action = "approve") =>
        client.PostAsJsonAsync($"/api/approvals/{stepId}/decision",
            new ApprovalDecisionRequestDto { Action = action, Comment = "Verifierat via API" });

    private static async Task AssertPaymentAsync(ApprovalApiFactory factory,
        string status, decimal balance, int transactionCount, int approvedCount)
    {
        // A fresh request scope reads persisted state, rather than tracked objects.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        var payment = await db.Payments.AsNoTracking().SingleAsync();
        Assert.Equal(status, payment.Status);
        Assert.Equal(status == PaymentStatuses.Completed, payment.ExecutedAt.HasValue);
        Assert.Equal(balance, (await db.Accounts.AsNoTracking().SingleAsync()).Balance);
        Assert.Equal(transactionCount, await db.Transactions.CountAsync());
        Assert.Equal(approvedCount, await db.ApprovalSteps.CountAsync(s => s.Status == ApprovalStatuses.Approved));
    }

    [Theory]
    [InlineData("99999.99", 1)]
    [InlineData("100000.00", 1)]
    [InlineData("100000.01", 2)]
    public async Task AmountBoundary_CreationInboxAndDecisionsApplySameStrictRule(
        string amountText, int requiredSteps)
    {
        using var factory = new ApprovalApiFactory();
        await SeedAsync(factory);
        var amount = decimal.Parse(amountText, CultureInfo.InvariantCulture);
        var payment = await CreateAsync(factory, amount);
        Assert.Equal(PaymentStatuses.PendingApproval, payment.Status);
        using var first = Client(factory, FirstAttestantId);
        using var second = Client(factory, SecondAttestantId);

        var pending = Assert.Single((await InboxAsync(first)).Pending);
        Assert.Equal(amountText, pending.Amount);
        Assert.Equal(requiredSteps, pending.TotalSteps);
        Assert.Equal(requiredSteps == 2, pending.RequiresDoubleApproval);
        Assert.Equal(requiredSteps, pending.Timeline.Count);
        Assert.Equal(requiredSteps, pending.Attestants.Count);
        Assert.All(pending.Timeline, s => Assert.Equal(ApprovalStatuses.Pending, s.Status));
        await AssertPaymentAsync(factory, PaymentStatuses.PendingApproval, 500000m, 0, 0);

        var response = await DecideAsync(first, pending.ApprovalStepId);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var decision = (await response.Content.ReadFromJsonAsync<ApprovalDecisionResponseDto>())!;
        Assert.Equal(ApprovalStatuses.Approved, decision.StepStatus);
        Assert.Empty((await InboxAsync(first)).Pending);

        if (requiredSteps == 1)
        {
            Assert.Equal(PaymentStatuses.Completed, decision.PaymentStatus);
            Assert.Empty((await InboxAsync(second)).Pending);
            await AssertPaymentAsync(factory, PaymentStatuses.Completed, 500000m - amount, 1, 1);
        }
        else
        {
            Assert.Equal(PaymentStatuses.PendingApproval, decision.PaymentStatus);
            await AssertPaymentAsync(factory, PaymentStatuses.PendingApproval, 500000m, 0, 1);
            var next = Assert.Single((await InboxAsync(second)).Pending);
            Assert.Equal(payment.Id, next.PaymentId);
            Assert.Equal(2, next.CurrentStep);
            Assert.Equal("Johan", next.Timeline[0].DecidedByName);
            Assert.Equal(ApprovalStatuses.Approved, next.Timeline[0].Status);
            Assert.Equal(ApprovalStatuses.Pending, next.Timeline[1].Status);

            var finalResponse = await DecideAsync(second, next.ApprovalStepId);
            Assert.Equal(HttpStatusCode.OK, finalResponse.StatusCode);
            Assert.Equal(PaymentStatuses.Completed,
                (await finalResponse.Content.ReadFromJsonAsync<ApprovalDecisionResponseDto>())!.PaymentStatus);
            await AssertPaymentAsync(factory, PaymentStatuses.Completed, 500000m - amount, 1, 2);
            var timeline = Assert.Single((await InboxAsync(first)).RecentlyHandled).Timeline;
            Assert.Equal(new[] { "Johan", "Eva" }, timeline.Select(s => s.DecidedByName));

            var replay = await DecideAsync(second, next.ApprovalStepId);
            Assert.Equal(HttpStatusCode.Conflict, replay.StatusCode);
            await AssertPaymentAsync(factory, PaymentStatuses.Completed, 500000m - amount, 1, 2);
        }
    }

    [Fact]
    public async Task SameAdminCannotApproveTwoDifferentlyAssignedSteps_ConflictPersistsNoChanges()
    {
        using var factory = new ApprovalApiFactory();
        await SeedAsync(factory);
        await CreateAsync(factory, 150000m);
        using var first = Client(factory, FirstAttestantId);
        using var second = Client(factory, SecondAttestantId);
        using var admin = Client(factory, AdminId, UserRoles.Admin);
        var firstStep = Assert.Single((await InboxAsync(first)).Pending).ApprovalStepId;
        var secondStep = Assert.Single((await InboxAsync(second)).Pending).ApprovalStepId;

        var accepted = await DecideAsync(admin, firstStep);
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var denied = await DecideAsync(admin, secondStep);

        Assert.Equal(HttpStatusCode.Conflict, denied.StatusCode);
        var problem = (await denied.Content.ReadFromJsonAsync<ProblemDetails>())!;
        Assert.Equal(409, problem.Status);
        Assert.Equal("Du har redan godkänt den här betalningen. En annan attestant måste godkänna nästa steg.",
            problem.Detail);
        await AssertPaymentAsync(factory, PaymentStatuses.PendingApproval, 500000m, 0, 1);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            var savedStep = await db.ApprovalSteps.AsNoTracking().SingleAsync(s => s.PublicId == secondStep);
            Assert.Equal(ApprovalStatuses.Pending, savedStep.Status);
            Assert.Null(savedStep.DecidedById);
            Assert.Null(savedStep.DecidedAt);
            Assert.Null(savedStep.Comment);
            Assert.Null(savedStep.DecisionSource);
            Assert.Equal(2, await db.ApprovalSteps.CountAsync());
            Assert.Equal(2, await db.AuditEntries.CountAsync()); // Creation and the first decision only.
        }

        var final = await DecideAsync(second, secondStep);
        Assert.Equal(HttpStatusCode.OK, final.StatusCode);
        await AssertPaymentAsync(factory, PaymentStatuses.Completed, 350000m, 1, 2);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            Assert.Equal(new int?[] { AdminId, SecondAttestantId }, await db.ApprovalSteps
                .AsNoTracking().OrderBy(s => s.StepNumber).Select(s => s.DecidedById).ToListAsync());
        }
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RejectEitherStep_StopsPaymentAndNeverMovesMoney(bool approveFirst)
    {
        using var factory = new ApprovalApiFactory();
        await SeedAsync(factory);
        await CreateAsync(factory, 150000m);
        using var first = Client(factory, FirstAttestantId);
        using var second = Client(factory, SecondAttestantId);
        var firstStep = Assert.Single((await InboxAsync(first)).Pending).ApprovalStepId;
        var secondStep = Assert.Single((await InboxAsync(second)).Pending).ApprovalStepId;
        if (approveFirst)
            Assert.Equal(HttpStatusCode.OK, (await DecideAsync(first, firstStep)).StatusCode);

        var response = await DecideAsync(approveFirst ? second : first,
            approveFirst ? secondStep : firstStep, "reject");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(PaymentStatuses.Rejected,
            (await response.Content.ReadFromJsonAsync<ApprovalDecisionResponseDto>())!.PaymentStatus);
        await AssertPaymentAsync(factory, PaymentStatuses.Rejected, 500000m, 0, approveFirst ? 1 : 0);
        Assert.Empty((await InboxAsync(first)).Pending);
        Assert.Empty((await InboxAsync(second)).Pending);
        var laterApproval = await DecideAsync(second, secondStep);
        Assert.Equal(HttpStatusCode.Conflict, laterApproval.StatusCode);
        await AssertPaymentAsync(factory, PaymentStatuses.Rejected, 500000m, 0, approveFirst ? 1 : 0);
    }

    [Fact]
    public async Task DoubleApproval_StepAssignmentAndTenantIsolationRemainEnforced()
    {
        using var factory = new ApprovalApiFactory();
        await SeedAsync(factory);
        await CreateAsync(factory, 150000m);
        using var first = Client(factory, FirstAttestantId);
        using var second = Client(factory, SecondAttestantId);
        using var foreignAdmin = Client(factory, 40, UserRoles.Admin, tenantId: 2);
        var secondStep = Assert.Single((await InboxAsync(second)).Pending).ApprovalStepId;

        Assert.Equal(HttpStatusCode.Forbidden, (await DecideAsync(first, secondStep)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await DecideAsync(foreignAdmin, secondStep)).StatusCode);
        Assert.Empty((await InboxAsync(foreignAdmin)).Pending);
        await AssertPaymentAsync(factory, PaymentStatuses.PendingApproval, 500000m, 0, 0);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        Assert.Single(await db.AuditEntries.ToListAsync());
        Assert.All(await db.ApprovalSteps.ToListAsync(), s => Assert.Null(s.DecidedById));
    }
}
