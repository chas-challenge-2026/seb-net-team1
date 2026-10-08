namespace SebPortal.Api.Exceptions;

public class AccountNotFoundException(int accountId)
    : NotFoundException(
        userMessage: "Kontot hittades inte.",
        technicalMessage: $"Account with id {accountId} was not found.");

/// <summary>
/// Thrown when an account exists but belongs to a different tenant than
/// the logged in user. Never trust a client supplied account id without
/// this check (see dashboard-contract.md and payments-contract.md Backend Notes).
/// </summary>
public class AccountAccessDeniedException(int accountId, int attemptedByTenantId)
    : ForbiddenException(
        userMessage: "Du har inte behörighet till det kontot.",
        technicalMessage: $"Tenant {attemptedByTenantId} attempted to access Account {accountId}, which belongs to a different tenant.");
