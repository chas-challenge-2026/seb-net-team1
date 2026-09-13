using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Controllers;
using SebPortal.Api.DTOs;
using Xunit;

namespace SebPortal.Api.Tests;

public class DashboardControllerTests
{
    [Fact]
    public void Get_ReturnsOkResult()
    {
        // Arrange
        var controller = new DashboardController();

        // Act
        var result = controller.Get();

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public void Get_ReturnsDashboardResponseWithExpectedShape()
    {
        // Arrange
        var controller = new DashboardController();

        // Act
        var result = controller.Get() as OkObjectResult;
        var response = result?.Value as DashboardResponse;

        // Assert
        Assert.NotNull(response);
        Assert.False(string.IsNullOrWhiteSpace(response!.TenantName));
        Assert.NotNull(response.User);
        Assert.NotEmpty(response.Accounts);
        Assert.NotEmpty(response.RecentPayments);
        Assert.NotEmpty(response.PendingApprovals);
    }

    [Fact]
    public void Get_MoneyFieldsAreStrings_NotFloats()
    {
        // Arrange
        var controller = new DashboardController();

        // Act
        var result = controller.Get() as OkObjectResult;
        var response = result?.Value as DashboardResponse;

        // Assert
        Assert.NotNull(response);

        foreach (var account in response!.Accounts)
        {
            Assert.True(decimal.TryParse(account.Balance, out _),
                $"Balance '{account.Balance}' should be a parseable decimal string.");
        }

        foreach (var payment in response.RecentPayments)
        {
            Assert.True(decimal.TryParse(payment.Amount, out _),
                $"Amount '{payment.Amount}' should be a parseable decimal string.");
        }

        foreach (var approval in response.PendingApprovals)
        {
            Assert.True(decimal.TryParse(approval.Amount, out _),
                $"Amount '{approval.Amount}' should be a parseable decimal string.");
        }
    }

    [Fact]
    public void Get_PaymentStatuses_AreValidContractValues()
    {
        // Arrange
        var controller = new DashboardController();
        var validStatuses = new[] { "completed", "pending_approval", "rejected" };

        // Act
        var result = controller.Get() as OkObjectResult;
        var response = result?.Value as DashboardResponse;

        // Assert
        Assert.NotNull(response);

        foreach (var payment in response!.RecentPayments)
        {
            Assert.Contains(payment.Status, validStatuses);
        }

        foreach (var approval in response.PendingApprovals)
        {
            Assert.Contains(approval.Status, validStatuses);
        }
    }
}