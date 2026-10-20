using System.Net;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using SebPortal.Api.Data;
using SebPortal.Api.Models;

namespace SebPortal.Api.Tests;

public sealed class PaymentDetailsRecipientIntegrationTests
{
    private const string DestinationIban = "SE6250000000054910000099";

    [Theory]
    [InlineData(true, true, "Own supplier")]
    [InlineData(false, true, null)]
    [InlineData(false, false, null)]
    public async Task GetPayment_RecipientNameMatchesOnlyDestinationWithinAuthenticatedTenant(
        bool ownTenantMatch, bool otherTenantMatch, string? expectedName)
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateAuthenticatedClient();
        await SeedPaymentAsync(factory);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
            db.Recipients.Add(new Recipient
            {
                TenantId = 1,
                Name = "Different destination",
                Iban = "SE3550000000054910000003"
            });
            if (ownTenantMatch)
                db.Recipients.Add(new Recipient
                {
                    TenantId = 1, Name = "Own supplier", Iban = DestinationIban
                });
            if (otherTenantMatch)
                db.Recipients.Add(new Recipient
                {
                    TenantId = 2, Name = "Private other tenant supplier", Iban = DestinationIban
                });
            await db.SaveChangesAsync();
        }

        using var response = await client.GetAsync("/api/payments/1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(DestinationIban, body.RootElement.GetProperty("toIban").GetString());
        Assert.Equal(expectedName, body.RootElement.GetProperty("recipientName").GetString());
    }

    [Fact]
    public async Task GetPayment_FromAnotherTenant_DoesNotExposeDetails()
    {
        using var factory = new RecipientsApiFactory();
        using var client = factory.CreateAuthenticatedClient(tenantId: 2, userId: 3);
        await SeedPaymentAsync(factory);

        using var response = await client.GetAsync("/api/payments/1");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    private static async Task SeedPaymentAsync(RecipientsApiFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<SebDbContext>();
        db.Accounts.Add(new Account
        {
            Id = 1, TenantId = 1, AccountName = "Source account",
            Iban = "SE3550000000054910000003", Currency = "SEK", Balance = 1000m
        });
        db.Payments.Add(new Payment
        {
            Id = 1, TenantId = 1, FromAccountId = 1, ToIban = DestinationIban,
            Amount = 100m, Currency = "SEK", Status = PaymentStatuses.Completed
        });
        await db.SaveChangesAsync();
    }
}
