## Dashboard

**Related tickets:** This contract defines the shape only (US-03, Sprint 1). The real implementation is US-20 (`Bygga dashboard med konton och senaste betalningar`), Sprint 3. Whoever picks up US-20 should follow this contract, not redefine it. Update this doc in the same PR if anything changes.

### GET `/api/dashboard`

Returns the logged-in user's overview data: tenant info, accounts, recent payments, and (for attestants/admins) pending approvals.

Frontend uses this endpoint to render the Dashboard page.

Requires a valid JWT (`Authorization: Bearer <token>`).

---

## Request

No request body, no query parameters.

---

## Success Response

### `200 OK`

```json
{
  "tenantName": "Malmö Bygg AB",
  "user": {
    "id": 1,
    "name": "Lisa Andersson",
    "email": "lisa@malmobygg.se",
    "role": "attestant",
    "tenantId": 1
  },
  "accounts": [
    {
      "id": 1,
      "accountName": "Företagskonto",
      "iban": "SE3550000000054910000003",
      "balance": "245000.50",
      "availableBalance": "170000.50",
      "reservedAmount": "75000.00",
      "currency": "SEK",
      "pendingPaymentCount": 1
    }
  ],
  "recentPayments": [
    {
      "id": 42,
      "toIban": "SE4550000000054910000099",
      "amount": "12500.00",
      "currency": "SEK",
      "reference": "Faktura 2026-114",
      "status": "pending_approval",
      "createdAt": "2026-08-30T09:15:00Z"
    }
  ],
  "pendingApprovals": [
    {
      "id": 43,
      "toIban": "SE1250000000054910000077",
      "amount": "8000.00",
      "currency": "SEK",
      "reference": "Löner september",
      "status": "pending_approval",
      "createdAt": "2026-08-31T14:00:00Z"
    }
  ],
  "stats": {
    "totalBalance": "3840000.00",
    "availableBalance": "3515000.00",
    "pendingApprovalCount": 3,
    "myPendingApprovalCount": 2,
    "paymentsThisMonthCount": 7,
    "completedThisMonthCount": 5,
    "completedThisMonthAmount": "84250.50",
    "rejectedThisMonthCount": 1
  }
}
```

### Response fields

| Field | Type | Description |
|---|---|---|
| `tenantName` | string | Name of the company/tenant |
| `user.id` | number | Logged-in user's id |
| `user.name` | string | Logged-in user's name |
| `user.email` | string | Logged-in user's email |
| `user.role` | string | `initiator`, `attestant`, or `admin` |
| `user.tenantId` | number | The company/tenant the user belongs to |
| `accounts[].id` | number | Account id |
| `accounts[].accountName` | string | Display name of account |
| `accounts[].iban` | string | Account IBAN, no spaces (frontend formats for display) |
| `accounts[].balance` | string | Current balance, as a decimal string, never a float |
| `accounts[].currency` | string | Currency code |
| `recentPayments[].id` | number | Payment id |
| `recentPayments[].toIban` | string | Recipient IBAN, no spaces |
| `recentPayments[].amount` | string | Payment amount, as a decimal string, never a float |
| `recentPayments[].currency` | string | Currency code |
| `recentPayments[].reference` | string | Payment reference/note |
| `recentPayments[].status` | string | One of: `completed`, `pending_approval`, `rejected` |
| `recentPayments[].createdAt` | string (ISO 8601) | When the payment was created |
| `accounts[].availableBalance` | string | Balance minus money reserved by the account's payments waiting for attest |
| `accounts[].reservedAmount` | string | Sum of the account's payments waiting for attest |
| `accounts[].pendingPaymentCount` | number | How many of the account's payments wait for attest |
| `pendingApprovals[]` | array | Same shape as `recentPayments[]`. Payments waiting for the logged-in attestant's decision (for admins also unassigned steps), never the user's own payments. Empty for `initiator` |
| `stats.totalBalance` | string | Sum of all account balances |
| `stats.availableBalance` | string | Sum of all available balances |
| `stats.pendingApprovalCount` | number | Payments waiting for attest in the whole tenant |
| `stats.myPendingApprovalCount` | number | Approval steps waiting for the logged-in user (the length of `pendingApprovals`) |
| `stats.paymentsThisMonthCount` | number | Payments created this calendar month (UTC) |
| `stats.completedThisMonthCount` / `completedThisMonthAmount` | number / string | Of those, completed |
| `stats.rejectedThisMonthCount` | number | Of those, rejected |

### Status values

| Value | Meaning |
|---|---|
| `completed` | Payment has been approved and sent |
| `pending_approval` | Waiting on one or more attestants |
| `rejected` | An attestant rejected the payment |

---

## Error Responses

### `401 Unauthorized`

Returned when the JWT is missing, invalid, or expired.

```json
{
  "status": 401,
  "title": "Unauthorized",
  "detail": "Åtkomst nekad. Logga in igen."
}
```

---

## Frontend Notes

Frontend can use this contract to:
- render account balance cards
- render the recent payments table
- conditionally render the "Åtgärd krävs" banner when `pendingApprovals` is non-empty
- create mock dashboard data for the Dashboard page before the backend is ready

---

## Backend Notes

Backend should use this contract to:
- implement `GET /api/dashboard`
- derive `tenantId` and the user id from the JWT claims only. Never trust a client-supplied id for either. v1 built SQL by inserting a session tenant id directly into the query (BUG-01/BUG-11 pattern), which this contract prevents at the endpoint boundary
- scope `pendingApprovals` to the logged-in attestant's own id, not any id passed by the client. This is the same issue as BUG-11 (IDOR in attestkorgen)
- only populate `pendingApprovals` when the user's role is `attestant` or `admin`
- return the most recent 20 payments for the tenant
- represent all money values as decimal strings, never floating-point numbers
- return consistent ProblemDetails error responses (status, title, detail) per the format above

---

## Important

This contract is a first version and can be changed if frontend or backend needs adjustments.
If the request or response format changes, this document should be updated so the whole team stays aligned.