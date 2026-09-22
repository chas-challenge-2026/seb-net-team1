using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.Models;
using SebPortal.Api.Repositories;
using SebPortal.Api.Services;
using Xunit;

namespace SebPortal.Tests;

public class ApprovalServiceTests
{
    private static (
        SebDbContext Context,
        ApprovalRepository Repository,
        ApprovalService Service)
        CreateService()
    {
        var options = new DbContextOptionsBuilder<SebDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new SebDbContext(options);
        var repository = new ApprovalRepository(context);
        var service = new ApprovalService(repository);

        return (context, repository, service);
    }

    [Fact]
    public async Task Admin_Can_Get_Pending_Approvals()
    {
        var (context, _, service) = CreateService();

        var tenant = new Tenant
        {
            Id = 1,
            Name = "Test Company"
        };

        var admin = new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Admin",
            Email = "admin@test.se",
            Role = "admin"
        };

        var payment = new Payment
        {
            Id = 1,
            TenantId = 1,
            Amount = 1000,
            Currency = "SEK",
            ToIban = "SE123",
            Status = "pending_approval",
            CreatedAt = DateTime.UtcNow
        };

        var approvalStep = new ApprovalStep
        {
            Id = 1,
            PaymentId = 1,
            Status = "pending",
            StepNumber = 1,
            Payment = payment
        };

        context.Tenants.Add(tenant);
        context.Users.Add(admin);
        context.Payments.Add(payment);
        context.ApprovalSteps.Add(approvalStep);

        await context.SaveChangesAsync();

        var result = await service.GetPendingApprovalsAsync(
            userId: 1,
            tenantId: 1);

        Assert.Single(result);
        Assert.Equal(1, result[0].PaymentId);
        Assert.Equal(1000, result[0].Amount);
    }

    [Fact]
    public async Task Non_Admin_Cannot_Get_Pending_Approvals()
    {
        var (context, _, service) = CreateService();

        var user = new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Attestant",
            Email = "attestant@test.se",
            Role = "attestant"
        };

        context.Users.Add(user);
        await context.SaveChangesAsync();

        await Assert.ThrowsAsync<UnauthorizedAccessException>(
            () => service.GetPendingApprovalsAsync(
                userId: 1,
                tenantId: 1));
    }

    [Fact]
    public async Task User_From_Wrong_Tenant_Cannot_Get_Pending_Approvals()
    {
        var (context, _, service) = CreateService();

        var user = new User
        {
            Id = 1,
            TenantId = 2,
            Name = "Admin",
            Email = "admin@other.se",
            Role = "admin"
        };

        context.Users.Add(user);
        await context.SaveChangesAsync();

        await Assert.ThrowsAsync<UnauthorizedAccessException>(
            () => service.GetPendingApprovalsAsync(
                userId: 1,
                tenantId: 1));
    }

    [Fact]
    public async Task Admin_Can_Approve_Pending_Payment()
    {
        var (context, _, service) = CreateService();

        var admin = new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Admin",
            Email = "admin@test.se",
            Role = "admin"
        };

        var payment = new Payment
        {
            Id = 1,
            TenantId = 1,
            Amount = 500,
            Currency = "SEK",
            ToIban = "SE123",
            Status = "pending_approval",
            CreatedAt = DateTime.UtcNow
        };

        var approvalStep = new ApprovalStep
        {
            Id = 1,
            PaymentId = 1,
            Status = "pending",
            StepNumber = 1,
            Payment = payment
        };

        context.Users.Add(admin);
        context.Payments.Add(payment);
        context.ApprovalSteps.Add(approvalStep);

        await context.SaveChangesAsync();

        var result = await service.DecideApprovalAsync(
            approvalStepId: 1,
            userId: 1,
            tenantId: 1,
            action: "approve",
            comment: "Godkänd");

        Assert.True(result);

        var updatedPayment = await context.Payments.FindAsync(1);
        var updatedStep = await context.ApprovalSteps.FindAsync(1);

        Assert.Equal("completed", updatedPayment!.Status);
        Assert.Equal("approved", updatedStep!.Status);
        Assert.Equal("Godkänd", updatedStep.Comment);
        Assert.NotNull(updatedStep.DecidedAt);
    }

    [Fact]
    public async Task Non_Admin_Cannot_Approve_Payment()
    {
        var (context, _, service) = CreateService();

        var user = new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Attestant",
            Email = "attestant@test.se",
            Role = "attestant"
        };

        context.Users.Add(user);
        await context.SaveChangesAsync();

        await Assert.ThrowsAsync<UnauthorizedAccessException>(
            () => service.DecideApprovalAsync(
                approvalStepId: 1,
                userId: 1,
                tenantId: 1,
                action: "approve",
                comment: null));
    }

    [Fact]
    public async Task Admin_Cannot_Approve_Payment_From_Wrong_Tenant()
    {
        var (context, _, service) = CreateService();

        var admin = new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Admin",
            Email = "admin@test.se",
            Role = "admin"
        };

        var payment = new Payment
        {
            Id = 1,
            TenantId = 2,
            Amount = 500,
            Currency = "SEK",
            ToIban = "SE123",
            Status = "pending_approval"
        };

        var approvalStep = new ApprovalStep
        {
            Id = 1,
            PaymentId = 1,
            Status = "pending",
            Payment = payment
        };

        context.Users.Add(admin);
        context.Payments.Add(payment);
        context.ApprovalSteps.Add(approvalStep);

        await context.SaveChangesAsync();

        var result = await service.DecideApprovalAsync(
            approvalStepId: 1,
            userId: 1,
            tenantId: 1,
            action: "approve",
            comment: null);

        Assert.False(result);

        var unchangedStep = await context.ApprovalSteps.FindAsync(1);
        Assert.Equal("pending", unchangedStep!.Status);
    }

    [Fact]
    public async Task Already_Handled_Approval_Cannot_Be_Handled_Again()
    {
        var (context, _, service) = CreateService();

        var admin = new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Admin",
            Email = "admin@test.se",
            Role = "admin"
        };

        var payment = new Payment
        {
            Id = 1,
            TenantId = 1,
            Amount = 500,
            Currency = "SEK",
            ToIban = "SE123",
            Status = "pending_approval"
        };

        var approvalStep = new ApprovalStep
        {
            Id = 1,
            PaymentId = 1,
            Status = "approved",
            Payment = payment
        };

        context.Users.Add(admin);
        context.Payments.Add(payment);
        context.ApprovalSteps.Add(approvalStep);

        await context.SaveChangesAsync();

        var result = await service.DecideApprovalAsync(
            approvalStepId: 1,
            userId: 1,
            tenantId: 1,
            action: "approve",
            comment: null);

        Assert.False(result);
    }

    [Fact]
    public async Task Admin_Can_Reject_Pending_Payment()
    {
        var (context, _, service) = CreateService();

        var admin = new User
        {
            Id = 1,
            TenantId = 1,
            Name = "Admin",
            Email = "admin@test.se",
            Role = "admin"
        };

        var payment = new Payment
        {
            Id = 1,
            TenantId = 1,
            Amount = 500,
            Currency = "SEK",
            ToIban = "SE123",
            Status = "pending_approval"
        };

        var approvalStep = new ApprovalStep
        {
            Id = 1,
            PaymentId = 1,
            Status = "pending",
            Payment = payment
        };

        context.Users.Add(admin);
        context.Payments.Add(payment);
        context.ApprovalSteps.Add(approvalStep);

        await context.SaveChangesAsync();

        var result = await service.DecideApprovalAsync(
            approvalStepId: 1,
            userId: 1,
            tenantId: 1,
            action: "reject",
            comment: "Nekas");

        Assert.True(result);

        var updatedPayment = await context.Payments.FindAsync(1);
        var updatedStep = await context.ApprovalSteps.FindAsync(1);

        Assert.Equal("rejected", updatedPayment!.Status);
        Assert.Equal("rejected", updatedStep!.Status);
        Assert.Equal("Nekas", updatedStep.Comment);
    }
}