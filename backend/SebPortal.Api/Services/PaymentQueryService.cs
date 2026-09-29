using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Models;

namespace SebPortal.Api.Services;

/// <summary>Read side for payments: history list, details and CSV export. Always tenant scoped.</summary>
public class PaymentQueryService(SebDbContext dbContext, PaymentService paymentService)
{
    public const int MaxPageSize = 100;
    public const int MaxExportRows = 10_000;

    /// <summary>The export is read by people in Sweden, so times are shown in Swedish local time.</summary>
    private static readonly TimeZoneInfo StockholmTime = FindStockholmTime();

    private static TimeZoneInfo FindStockholmTime()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Europe/Stockholm");
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return TimeZoneInfo.Utc;
        }
    }

    public async Task<PagedResponse<PaymentListItemDto>> ListAsync(int tenantId, int userId, PaymentListQuery query)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, MaxPageSize);

        var filtered = Filter(tenantId, userId, query);
        var totalCount = await filtered.CountAsync();

        var payments = await filtered
            .OrderByDescending(p => p.CreatedAt)
            .ThenByDescending(p => p.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(p => p.FromAccount)
            .Include(p => p.CreatedBy)
            .Include(p => p.ApprovalSteps)
            .AsSplitQuery()
            .ToListAsync();

        return new PagedResponse<PaymentListItemDto>
        {
            Items = payments.Select(p => Fill(new PaymentListItemDto(), p)).ToList(),
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };
    }

    public async Task<PaymentDetailDto> GetDetailAsync(int tenantId, int userId, string? role, int paymentId)
    {
        var payment = await dbContext.Payments
            .AsNoTracking()
            .Include(p => p.FromAccount)
            .Include(p => p.CreatedBy)
            .Include(p => p.ApprovalSteps).ThenInclude(s => s.Attestant)
            .FirstOrDefaultAsync(p => p.Id == paymentId && p.TenantId == tenantId)
            ?? throw new PaymentNotFoundException(paymentId);

        var events = await dbContext.AuditEntries
            .AsNoTracking()
            .Include(e => e.User)
            .Where(e => e.TenantId == tenantId && e.EntityType == AuditEntityTypes.Payment && e.EntityId == paymentId)
            .OrderBy(e => e.ChainIndex)
            .ThenBy(e => e.Id)
            .ToListAsync();

        var detail = Fill(new PaymentDetailDto(), payment);
        detail.FromAccountIban = payment.FromAccount?.Iban ?? string.Empty;
        detail.RequiresApproval = paymentService.RequiresApproval(payment.Amount);
        detail.RequiresDoubleApproval = paymentService.RequiresDoubleApproval(payment.Amount);
        detail.ApprovalSteps = payment.ApprovalSteps
            .OrderBy(s => s.StepNumber)
            .Select(s => new ApprovalStepInfoDto
            {
                Id = s.Id,
                StepNumber = s.StepNumber,
                AttestantId = s.AttestantId,
                AttestantName = s.Attestant?.Name,
                Status = s.Status,
                DecidedAt = s.DecidedAt,
                Comment = s.Comment
            })
            .ToList();
        detail.MyApprovalStepId = FindDecidableStep(payment, userId, role)?.Id;
        detail.Events = events.Select(AuditLogService.ToDto).ToList();

        return detail;
    }

    /// <summary>
    /// Semicolon separated with a UTF-8 BOM and Swedish decimal comma, so the file
    /// opens correctly in Excel with Swedish regional settings.
    /// </summary>
    public async Task<byte[]> ExportCsvAsync(int tenantId, int userId, PaymentListQuery query)
    {
        var payments = await Filter(tenantId, userId, query)
            .OrderByDescending(p => p.CreatedAt)
            .ThenByDescending(p => p.Id)
            .Take(MaxExportRows)
            .Include(p => p.FromAccount)
            .Include(p => p.CreatedBy)
            .AsNoTracking()
            .ToListAsync();

        var swedish = CultureInfo.GetCultureInfo("sv-SE");
        string Local(DateTime utc) => TimeZoneInfo.ConvertTimeFromUtc(
            DateTime.SpecifyKind(utc, DateTimeKind.Utc), StockholmTime).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        var csv = new StringBuilder();
        csv.AppendLine("Id;Skapad;Genomförd;Från konto;Från IBAN;Mottagare IBAN;Belopp;Valuta;Referens;Status;Skapad av;Källa");

        foreach (var p in payments)
        {
            csv.AppendJoin(';',
                p.Id.ToString(CultureInfo.InvariantCulture),
                Local(p.CreatedAt),
                p.ExecutedAt is { } executedAt ? Local(executedAt) : string.Empty,
                Escape(p.FromAccount?.AccountName),
                p.FromAccount?.Iban ?? string.Empty,
                p.ToIban,
                p.Amount.ToString("0.00", swedish),
                p.Currency,
                Escape(p.Reference),
                StatusLabel(p.Status),
                Escape(p.CreatedBy?.Name),
                p.Source == PaymentSources.Batch ? "Batchfil" : "Manuell");
            csv.AppendLine();
        }

        return [.. Encoding.UTF8.GetPreamble(), .. Encoding.UTF8.GetBytes(csv.ToString())];
    }

    /// <summary>The pending step this user may decide right now, following the same rules as ApprovalService.</summary>
    public static ApprovalStep? FindDecidableStep(Payment payment, int userId, string? role)
    {
        if (payment.Status != PaymentStatuses.PendingApproval || payment.CreatedById == userId)
        {
            return null;
        }

        var alreadyApprovedOne = payment.ApprovalSteps.Any(s => s.AttestantId == userId && s.Status == ApprovalStatuses.Approved);
        if (alreadyApprovedOne)
        {
            return null;
        }

        var isAdmin = string.Equals(role, UserRoles.Admin, StringComparison.OrdinalIgnoreCase);

        return payment.ApprovalSteps
            .Where(s => s.Status == ApprovalStatuses.Pending && (s.AttestantId == userId || isAdmin))
            .OrderBy(s => s.StepNumber)
            .FirstOrDefault();
    }

    private IQueryable<Payment> Filter(int tenantId, int userId, PaymentListQuery query)
    {
        var payments = dbContext.Payments.AsNoTracking().Where(p => p.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(query.Status) && PaymentStatuses.All.Contains(query.Status))
        {
            payments = payments.Where(p => p.Status == query.Status);
        }

        if (query.AccountId is { } accountId)
        {
            payments = payments.Where(p => p.FromAccountId == accountId);
        }

        if (query.CreatedByMe)
        {
            payments = payments.Where(p => p.CreatedById == userId);
        }

        if (query.FromDate is { } fromDate)
        {
            var from = fromDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            payments = payments.Where(p => p.CreatedAt >= from);
        }

        if (query.ToDate is { } toDate)
        {
            var toExclusive = toDate.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            payments = payments.Where(p => p.CreatedAt < toExclusive);
        }

        var search = query.Search?.Trim();
        if (!string.IsNullOrEmpty(search))
        {
            var ibanSearch = search.Replace(" ", string.Empty).ToUpperInvariant();
            var idSearch = int.TryParse(search.TrimStart('#'), out var id) ? id : (int?)null;
            var pattern = $"%{EscapeLike(search.ToLowerInvariant())}%";
            var ibanPattern = $"%{EscapeLike(ibanSearch)}%";

            payments = payments.Where(p =>
                (p.Reference != null && EF.Functions.Like(p.Reference.ToLower(), pattern, "\\")) ||
                EF.Functions.Like(p.ToIban, ibanPattern, "\\") ||
                (idSearch != null && p.Id == idSearch));
        }

        return payments;
    }

    private TDto Fill<TDto>(TDto dto, Payment payment) where TDto : PaymentListItemDto
    {
        dto.Id = payment.Id;
        dto.FromAccountId = payment.FromAccountId;
        dto.FromAccountName = payment.FromAccount?.AccountName ?? string.Empty;
        dto.ToIban = payment.ToIban;
        dto.Amount = Money.Format(payment.Amount);
        dto.Currency = payment.Currency;
        dto.Reference = payment.Reference ?? string.Empty;
        dto.Status = payment.Status;
        dto.CreatedAt = payment.CreatedAt;
        dto.ExecutedAt = payment.ExecutedAt;
        dto.CreatedById = payment.CreatedById;
        dto.CreatedByName = payment.CreatedBy?.Name ?? "Okänd";
        dto.Source = payment.Source;

        var required = paymentService.RequiresApproval(payment.Amount) || payment.ApprovalSteps.Count > 0
            ? Math.Max(payment.ApprovalSteps.Count, paymentService.RequiredApprovalSteps(payment.Amount))
            : 0;

        dto.ApprovalProgress = required == 0
            ? null
            : new ApprovalProgressDto
            {
                Approved = payment.ApprovalSteps.Count(s => s.Status == ApprovalStatuses.Approved),
                Required = required
            };

        return dto;
    }

    private static string StatusLabel(string status) => status switch
    {
        PaymentStatuses.Completed => "Genomförd",
        PaymentStatuses.PendingApproval => "Väntar på attest",
        PaymentStatuses.Rejected => "Avvisad",
        _ => status
    };

    private static string Escape(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        // Neutralize spreadsheet formulas (CSV injection) and quote when needed.
        var safe = value[0] is '=' or '+' or '-' or '@' ? "'" + value : value;
        return safe.IndexOfAny([';', '"', '\n', '\r']) >= 0
            ? $"\"{safe.Replace("\"", "\"\"")}\""
            : safe;
    }

    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}
