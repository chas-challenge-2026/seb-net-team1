using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.DTOs;
using SebPortal.Api.Models;
using static SebPortal.Api.Tests.PortalApiFactory;

namespace SebPortal.Api.Tests;

/// <summary>
/// The whole payment flow over HTTP (acceptance criterion: "Alla audit-händelser i
/// DB — integrationstest för hela betalningsflödet"), plus the approval rules that
/// only make sense end to end.
/// </summary>
public class PaymentFlowIntegrationTests
{
    private static async Task<PaymentResponseDto> CreatePaymentAsync(HttpClient client, decimal amount, string reference, string? idempotencyKey = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/payments")
        {
            Content = JsonContent.Create(new { fromAccountId = AccountId, toIban = RecipientIban, amount = amount.ToString("F2", System.Globalization.CultureInfo.InvariantCulture), reference })
        };
        if (idempotencyKey is not null)
        {
            request.Headers.Add("Idempotency-Key", idempotencyKey);
        }

        var response = await client.SendAsync(request);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<PaymentResponseDto>())!;
    }

    private static async Task<ApprovalInboxResponse> InboxAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<ApprovalInboxResponse>("/api/approvals"))!;

    private static Task<HttpResponseMessage> DecideAsync(HttpClient client, int stepId, string action, string? comment = null) =>
        client.PostAsJsonAsync($"/api/approvals/{stepId}/decision", new { action, comment });

    [Fact]
    public async Task SinglePayment_CreatedAndApproved_LeavesACompleteAuditTrailAndNotifications()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");
        var johan = await factory.LoginAsync("johan@malmobygg.se");

        var payment = await CreatePaymentAsync(lisa, 75_000m, "Faktura #1043");
        Assert.Equal(PaymentStatuses.PendingApproval, payment.Status);

        var pending = Assert.Single((await InboxAsync(johan)).Pending);
        Assert.Equal(payment.Id, pending.PaymentId);
        Assert.False(pending.RequiresDoubleApproval);

        var decision = await DecideAsync(johan, pending.ApprovalStepId, "approve", "Ser korrekt ut");
        Assert.Equal(HttpStatusCode.OK, decision.StatusCode);

        var detail = (await lisa.GetFromJsonAsync<PaymentDetailDto>($"/api/payments/{payment.Id}"))!;
        Assert.Equal(PaymentStatuses.Completed, detail.Status);
        Assert.Equal(new[] { AuditActions.CreatePayment, AuditActions.ApprovePayment }, detail.Events.Select(e => e.Action));

        await factory.WithDbAsync(async db =>
        {
            var account = await db.Accounts.SingleAsync();
            Assert.Equal(925_000m, account.Balance);

            var audit = await db.AuditEntries.Where(e => e.EntityType == AuditEntityTypes.Payment && e.EntityId == payment.Id).OrderBy(e => e.ChainIndex).ToListAsync();
            Assert.Equal(new[] { AuditActions.CreatePayment, AuditActions.ApprovePayment }, audit.Select(e => e.Action));
            Assert.Equal(new int?[] { LisaId, JohanId }, audit.Select(e => e.UserId));
            Assert.All(audit, e => Assert.Equal(TenantId, e.TenantId));
            Assert.All(audit, e => Assert.Matches("^[0-9a-f]{64}$", e.Hash));

            var notifications = await db.Notifications.OrderBy(n => n.Id).ToListAsync();
            Assert.Collection(notifications,
                n => { Assert.Equal(JohanId, n.RecipientUserId); Assert.Equal(NotificationTypes.ApprovalRequested, n.Type); },
                n => { Assert.Equal(LisaId, n.RecipientUserId); Assert.Equal(NotificationTypes.PaymentCompleted, n.Type); });
            return 0;
        });

        var verification = await (await factory.LoginAsync("sara@malmobygg.se"))
            .GetFromJsonAsync<AuditChainVerificationResponse>("/api/audit-log/verify");
        Assert.True(verification!.Valid);
    }

    [Fact]
    public async Task LargePayment_NeedsTwoDifferentAttestantsInSequence()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");
        var johan = await factory.LoginAsync("johan@malmobygg.se");
        var erik = await factory.LoginAsync("erik@malmobygg.se");

        var payment = await CreatePaymentAsync(lisa, 250_000m, "Entreprenad etapp 2");

        var first = Assert.Single((await InboxAsync(johan)).Pending);
        Assert.True(first.RequiresDoubleApproval);
        Assert.Equal(1, first.CurrentStep);
        Assert.Equal(2, first.TotalSteps);
        Assert.Empty((await InboxAsync(erik)).Pending);

        var afterFirst = await (await DecideAsync(johan, first.ApprovalStepId, "approve")).Content.ReadFromJsonAsync<ApprovalDecisionResponseDto>();
        Assert.Equal(PaymentStatuses.PendingApproval, afterFirst!.PaymentStatus);

        // Step 2 goes to someone else than Johan, never back to him.
        Assert.Empty((await InboxAsync(johan)).Pending);
        var second = Assert.Single((await InboxAsync(erik)).Pending);
        Assert.Equal(2, second.CurrentStep);

        var afterSecond = await (await DecideAsync(erik, second.ApprovalStepId, "approve")).Content.ReadFromJsonAsync<ApprovalDecisionResponseDto>();
        Assert.Equal(PaymentStatuses.Completed, afterSecond!.PaymentStatus);

        var actions = await factory.WithDbAsync(db => db.AuditEntries
            .Where(e => e.EntityType == AuditEntityTypes.Payment && e.EntityId == payment.Id).OrderBy(e => e.ChainIndex).Select(e => e.Action).ToListAsync());
        Assert.Equal(new[] { AuditActions.CreatePayment, AuditActions.ApprovePaymentStep, AuditActions.ApprovePayment }, actions);
    }

    [Fact]
    public async Task RejectedPayment_KeepsTheBalanceAndTellsTheCreator()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");
        var johan = await factory.LoginAsync("johan@malmobygg.se");

        var payment = await CreatePaymentAsync(lisa, 80_000m, "Fel leverantör");
        var step = Assert.Single((await InboxAsync(johan)).Pending);

        var response = await DecideAsync(johan, step.ApprovalStepId, "reject", "Fel mottagare");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var lisasNotifications = (await lisa.GetFromJsonAsync<NotificationListResponse>("/api/notifications"))!;
        var rejected = Assert.Single(lisasNotifications.Items);
        Assert.Equal(NotificationTypes.PaymentRejected, rejected.Type);
        Assert.Contains("Fel mottagare", rejected.Message);
        Assert.Equal(1, lisasNotifications.UnreadCount);

        Assert.Equal(1_000_000m, await factory.WithDbAsync(db => db.Accounts.Select(a => a.Balance).SingleAsync()));
        Assert.Equal(AuditActions.RejectPayment, await factory.WithDbAsync(db =>
            db.AuditEntries.Where(e => e.EntityType == AuditEntityTypes.Payment && e.EntityId == payment.Id).OrderBy(e => e.ChainIndex).Select(e => e.Action).LastAsync()));
    }

    [Fact]
    public async Task Admin_CannotApproveTheirOwnPayment()
    {
        await using var factory = new PortalApiFactory();
        var sara = await factory.LoginAsync("sara@malmobygg.se");

        await CreatePaymentAsync(sara, 60_000m, "Saras egen betalning");

        // Not even shown in her inbox ...
        Assert.Empty((await InboxAsync(sara)).Pending);

        // ... and refused if she tries anyway.
        var stepId = await factory.WithDbAsync(db => db.ApprovalSteps.Select(s => s.Id).SingleAsync());
        var response = await DecideAsync(sara, stepId, "approve");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Contains("själv", problem!.Detail);
    }

    [Fact]
    public async Task Admin_WhoApprovedStepOne_IsNotGivenStepTwo()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");
        var sara = await factory.LoginAsync("sara@malmobygg.se");

        await CreatePaymentAsync(lisa, 300_000m, "Stor betalning");

        // Sara takes over Johan's step 1 as admin.
        var step1 = Assert.Single((await InboxAsync(sara)).Pending);
        Assert.Equal(HttpStatusCode.OK, (await DecideAsync(sara, step1.ApprovalStepId, "approve")).StatusCode);

        var step2 = await factory.WithDbAsync(db => db.ApprovalSteps.SingleAsync(s => s.StepNumber == 2));
        Assert.NotEqual(SaraId, step2.AttestantId);
        Assert.NotEqual(LisaId, step2.AttestantId);

        // She can see step 2 as admin, but may not approve a second time.
        var response = await DecideAsync(sara, step2.Id, "approve");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Attestant_CannotCreatePayments()
    {
        await using var factory = new PortalApiFactory();
        var johan = await factory.LoginAsync("johan@malmobygg.se");

        var response = await johan.PostAsJsonAsync("/api/payments",
            new { fromAccountId = AccountId, toIban = RecipientIban, amount = "100.00", reference = "Försök" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Initiator_CannotOpenTheApprovalInbox()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");

        var response = await lisa.GetAsync("/api/approvals");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task InvalidIban_IsRejectedWithASwedishMessage()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");

        var response = await lisa.PostAsJsonAsync("/api/payments",
            new { fromAccountId = AccountId, toIban = "SE8550000000054910000003", amount = "100.00", reference = "BUG-003" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Contains("MOD97", problem!.Detail);
    }

    [Fact]
    public async Task SameIdempotencyKey_CreatesOnePayment()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");

        var first = await CreatePaymentAsync(lisa, 1_000m, "Dubbelklick", idempotencyKey: "0b1d7c0e-8f6a-4a52-9f0e-3c2a1b4d5e6f");
        var second = await CreatePaymentAsync(lisa, 1_000m, "Dubbelklick", idempotencyKey: "0b1d7c0e-8f6a-4a52-9f0e-3c2a1b4d5e6f");

        Assert.Equal(first.Id, second.Id);
        Assert.Equal(1, await factory.WithDbAsync(db => db.Payments.CountAsync()));
        Assert.Equal(999_000m, await factory.WithDbAsync(db => db.Accounts.Select(a => a.Balance).SingleAsync()));
    }

    [Fact]
    public async Task PaymentList_FiltersAndPages()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");

        for (var i = 1; i <= 3; i++)
        {
            await CreatePaymentAsync(lisa, 100m * i, $"Liten {i}");
        }
        await CreatePaymentAsync(lisa, 70_000m, "Stor");

        var pending = (await lisa.GetFromJsonAsync<PagedResponse<PaymentListItemDto>>("/api/payments?status=pending_approval"))!;
        var item = Assert.Single(pending.Items);
        Assert.Equal("Stor", item.Reference);
        Assert.Equal(0, item.ApprovalProgress!.Approved);
        Assert.Equal(1, item.ApprovalProgress.Required);

        var page = (await lisa.GetFromJsonAsync<PagedResponse<PaymentListItemDto>>("/api/payments?page=2&pageSize=3"))!;
        Assert.Equal(4, page.TotalCount);
        Assert.Single(page.Items);

        var search = (await lisa.GetFromJsonAsync<PagedResponse<PaymentListItemDto>>("/api/payments?search=liten%202"))!;
        Assert.Equal("Liten 2", Assert.Single(search.Items).Reference);
    }

    [Fact]
    public async Task UnknownApiRoute_Returns404Json_NotTheFrontend()
    {
        await using var factory = new PortalApiFactory();
        var lisa = await factory.LoginAsync("lisa@malmobygg.se");

        var response = await lisa.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
