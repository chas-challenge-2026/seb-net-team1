## Payments

**Related tickets:** This contract defines the shape only (US-03, Sprint 1). The real implementation is US-21 (`Skapa payment API utifrån v1 NewPayment`) and US-22 (`Flytta betalningslogik till PaymentService`), both Sprint 3. Frontend build-out is US-23. Atomic balance handling is US-24. Whoever picks up those tickets should follow this contract, not redefine it. Update this doc in the same PR if anything changes.

### POST `/api/payments`

Creates a new outgoing payment. If the amount is above the approval threshold, the payment is created with status `pending_approval` instead of being completed immediately.

Frontend uses this endpoint when a user submits the "Ny betalning" form.

Requires a valid JWT (`Authorization: Bearer <token>`), role `initiator` or `admin`.

---

## Request

```json
{
  "fromAccountId": 1,
  "toIban": "SE4550000000054910000099",
  "amount": "12500.00",
  "reference": "Faktura #2001"
}
```

### Request fields

| Field | Type | Required | Description |
|---|---|---|---|
| `fromAccountId` | number | Yes | Id of the account to pay from. Must belong to the logged-in user's tenant |
| `toIban` | string | Yes | Recipient IBAN, no spaces |
| `amount` | string | Yes | Payment amount as a decimal string, never a float. Must be greater than 0 |
| `reference` | string | No | Free-text payment reference, max 100 chars |

---

## Success Response

### `201 Created`

```json
{
  "id": 101,
  "status": "pending_approval",
  "fromAccountId": 1,
  "toIban": "SE4550000000054910000099",
  "amount": "12500.00",
  "currency": "SEK",
  "reference": "Faktura #2001",
  "createdAt": "2026-09-02T10:30:00Z"
}
```

### Response fields

| Field | Type | Description |
|---|---|---|
| `id` | number | Newly created payment's id |
| `status` | string | `completed` if under the approval threshold, otherwise `pending_approval` |
| `fromAccountId` | number | Account the payment was made from |
| `toIban` | string | Recipient IBAN, no spaces |
| `amount` | string | Payment amount, as a decimal string |
| `currency` | string | Currently always `SEK` for MVP |
| `reference` | string | Payment reference |
| `createdAt` | string (ISO 8601) | When the payment was created |

---

## Error Responses

### `400 Bad Request`

Returned when a field is missing, the IBAN format is invalid, or the amount is not greater than 0.

```json
{
  "message": "Ogiltigt IBAN-format."
}
```

### `403 Forbidden`

Returned when `fromAccountId` does not belong to the logged-in user's tenant.

```json
{
  "message": "Du har inte behörighet till det kontot."
}
```

### `401 Unauthorized`

Returned when the JWT is missing, invalid, or expired.

```json
{
  "message": "Åtkomst nekad. Logga in igen."
}
```

---

## Frontend Notes

Frontend can use this contract to:
- build the "Ny betalning" form (account select, IBAN, amount, reference)
- show the correct success message based on returned `status`
- create mock payment responses for both `completed` and `pending_approval` outcomes

---

## Backend Notes

Backend should use this contract to:
- implement `POST /api/payments`
- derive `tenantId` and the user id from the JWT claims only. Never trust a client-supplied id
- validate that `fromAccountId` belongs to the logged-in user's tenant before creating the payment (`403` if not)
- validate the IBAN using real **MOD97** checksum validation, not just a format check. v1's regex accepted IBANs that looked right but had an invalid checksum (BUG-003). The MOD97 check itself is the native C/C++ module's job, not this endpoint's. This contract just requires the endpoint to call it and return `400` on failure
- represent `amount` as a decimal string, never a floating-point number
- read the approval threshold from a single shared source of truth, not a hardcoded constant per file. v1 defined the same threshold inconsistently across `NewPayment.cs`, `ApprovalInbox.cs`, and `appsettings.json` (BUG-006). This contract only defines the endpoint's behavior. Consolidating the threshold value itself belongs to whichever ticket owns approval-chain logic (US-25/US-26)
- return `201 Created` with the payment, not `200 OK`, since a new resource was created
- return consistent error responses per the format above

**Out of scope for this contract (belongs to later sprints):**
- Atomic balance deduction on completed payments (US-24)
- Creating approval steps / notifying attestants (US-25, US-26)
- Actual MOD97 implementation inside the native module

---

## Important

This contract is a first version and can be changed if frontend or backend needs adjustments.
If the request or response format changes, this document should be updated so the whole team stays aligned.
