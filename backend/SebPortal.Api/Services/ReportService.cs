using System.Globalization;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class ReportService(ReportRepository reportRepository)
{
    public const string ReportTimeZone = "Europe/Stockholm";
    private static readonly TimeZoneInfo StockholmTimeZone =
        TimeZoneInfo.FindSystemTimeZoneById(ReportTimeZone);

    /// <returns>The full period report, or null when the user no longer belongs to its claimed tenant.</returns>
    public async Task<PaymentReportResponse?> GetPaymentsAsync(
        int tenantId,
        int userId,
        string? from,
        string? to,
        CancellationToken cancellationToken = default)
    {
        // Validate here as well as in the UI so every caller uses the same strict contract.
        if (!TryParseDate(from, out var fromDate) || !TryParseDate(to, out var toDate))
        {
            throw new InvalidReportPeriodException(
                "Ange både från- och tilldatum som giltiga datum i formatet ÅÅÅÅ-MM-DD.");
        }

        if (fromDate > toDate)
        {
            throw new InvalidReportPeriodException("Fråndatum får inte vara efter tilldatum.");
        }

        DateTime fromUtc;
        DateTime toUtcExclusive;
        try
        {
            // Convert each midnight separately: a Stockholm day can be 23 or 25 hours
            // when daylight saving time changes. Adding 24 hours in UTC is incorrect.
            fromUtc = TimeZoneInfo.ConvertTimeToUtc(
                fromDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), StockholmTimeZone);
            toUtcExclusive = TimeZoneInfo.ConvertTimeToUtc(
                toDate.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified), StockholmTimeZone);
        }
        catch (ArgumentException)
        {
            throw new InvalidReportPeriodException("Perioden ligger utanför det datumintervall som stöds.");
        }

        if (!await reportRepository.UserBelongsToTenantAsync(userId, tenantId, cancellationToken))
        {
            return null;
        }

        var payments = await reportRepository.GetPaymentsAsync(
            tenantId, fromUtc, toUtcExclusive, cancellationToken);

        return new PaymentReportResponse
        {
            From = fromDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            To = toDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            TimeZone = ReportTimeZone,
            Payments = payments.Select(p => new PaymentReportRowDto
            {
                Id = p.Id,
                Reference = p.Reference ?? string.Empty,
                ToIban = p.ToIban,
                FromAccountName = p.FromAccountName,
                Amount = p.Amount.ToString("F2", CultureInfo.InvariantCulture),
                Currency = p.Currency,
                Status = p.Status,
                // The stored clock value is UTC even when the legacy provider returns
                // Unspecified. Restore its known kind without using the host's local zone.
                CreatedAt = DateTime.SpecifyKind(p.CreatedAt, DateTimeKind.Utc)
            }).ToList()
        };
    }

    private static bool TryParseDate(string? value, out DateOnly date) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
}
