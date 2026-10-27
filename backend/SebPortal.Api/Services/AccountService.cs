using Microsoft.EntityFrameworkCore;
using SebPortal.Api.Data;
using SebPortal.Api.DTOs;
using SebPortal.Api.Exceptions;
using SebPortal.Api.Repositories;

namespace SebPortal.Api.Services;

public class AccountService(SebDbContext dbContext, DashboardRepository dashboardRepository)
{
    public async Task<List<AccountDto>> GetAccountsAsync(int tenantId)
    {
        var accounts = await dashboardRepository.GetAccountsAsync(tenantId);
        var reserved = await dashboardRepository.GetReservedByAccountAsync(tenantId);
        return accounts.Select(a => DashboardService.ToAccountDto(a, reserved)).ToList();
    }

    public async Task<AccountDto> GetAccountAsync(int tenantId, int accountId)
    {
        var account = await dbContext.Accounts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == accountId && a.TenantId == tenantId)
            ?? throw new AccountNotFoundException(accountId);

        var reserved = await dashboardRepository.GetReservedByAccountAsync(tenantId);
        return DashboardService.ToAccountDto(account, reserved);
    }

    public async Task<PagedResponse<TransactionDto>> GetTransactionsAsync(int tenantId, int accountId, int page, int pageSize)
    {
        var accountExists = await dbContext.Accounts.AnyAsync(a => a.Id == accountId && a.TenantId == tenantId);
        if (!accountExists)
        {
            throw new AccountNotFoundException(accountId);
        }

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = dbContext.Transactions.AsNoTracking().Where(t => t.AccountId == accountId);
        var totalCount = await query.CountAsync();

        var items = await query
            .OrderByDescending(t => t.Date)
            .ThenByDescending(t => t.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(t => new { t.Id, t.Date, t.Amount, t.Description, t.TransactionType, t.PaymentId })
            .ToListAsync();

        return new PagedResponse<TransactionDto>
        {
            Items = items.Select(t => new TransactionDto
            {
                Id = t.Id,
                Date = t.Date,
                Amount = Money.Format(t.Amount),
                Description = t.Description ?? string.Empty,
                TransactionType = t.TransactionType ?? string.Empty,
                PaymentId = t.PaymentId
            }).ToList(),
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };
    }
}
