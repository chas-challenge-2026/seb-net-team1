using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SebPortal.Api.Auth;
using SebPortal.Api.DTOs;
using SebPortal.Api.Services;

namespace SebPortal.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class AccountsController(AccountService accountService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<List<AccountDto>>> List()
    {
        if (User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await accountService.GetAccountsAsync(tenantId));
    }

    [HttpGet("{accountId:int}")]
    public async Task<ActionResult<AccountDto>> Get(int accountId)
    {
        if (User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await accountService.GetAccountAsync(tenantId, accountId));
    }

    [HttpGet("{accountId:int}/transactions")]
    public async Task<ActionResult<PagedResponse<TransactionDto>>> Transactions(int accountId, int page = 1, int pageSize = 20)
    {
        if (User.GetTenantId() is not { } tenantId)
        {
            return Unauthorized();
        }

        return Ok(await accountService.GetTransactionsAsync(tenantId, accountId, page, pageSize));
    }
}
