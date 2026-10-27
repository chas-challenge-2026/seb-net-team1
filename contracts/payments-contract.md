## Payments

**Related tickets:** US-03 (shape), US-21/US-22 (payment API and PaymentService), US-23 (frontend), US-24 (atomic balance handling), US-25/US-26 (approval steps). Update this doc in the same PR if anything changes.

Endpoints:

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/api/payments` | initiator, admin | Create one payment |
| GET | `/api/payments` | all | Payment history, filtered and paged |
| GET | `/api/payments/{id}` | all | One payment with approval steps and audit trail |
| GET | `/api/payments/export` | all | Payment history as a CSV file |
| POST | `/api/payments/batch/validate` | initiator, admin | Check a CSV batch file without creating anything |
| POST | `/api/payments/batch` | initiator, admin | Create every payment in a CSV batch file, or none |

All require a valid JWT. Everything is scoped to the caller's tenant from the JWT.

### Business rules

- A payment `<= PaymentRules:ApprovalThreshold` (50 000 SEK) is completed immediately: the balance is drawn and a transaction is written, in the same database transaction as the payment.
- A payment above the threshold is created as `pending_approval` with its first approval step assigned to an attestant (never the creator), who is notified. Above `PaymentRules:DoubleApprovalThreshold` (200 000 SEK) it needs two approvals by two different people; step 2 is created when step 1 is approved. See [approvals-contract.md](approvals-contract.md).
- New payments must fit in the account's **available balance**: balance minus the money reserved by the account's payments that are waiting for attest.
- Concurrent writes to the same account are detected with PostgreSQL's `xmin` (optimistic locking) and retried, so the balance can never be overdrawn or double counted.

### Idempotency header

Clients should send an `Idempotency-Key` header when creating a payment:

```http
Idempotency-Key: 9f45f15e-23d4-4fa6-8df8-a80a45f05061
```

The key identifies one logical payment attempt and may contain at most 128
characters. A retry of the same payment must reuse the same key. A genuinely
new payment must use a new key.

- Same tenant, user, key and payment data: returns the existing payment without
  creating another payment, transaction, approval step or audit entry.
- Same tenant, user and key with different payment data: returns `409 Conflict`.
- The same textual key may be used independently by another user or tenant.
- The header is optional for backwards compatibility. Duplicate protection only
  applies when a non-empty key is supplied.

---

### POST `/api/payments`

Headers: `Idempotency-Key: <uuid>` (optional, max 64 characters). Generate one per form submission and reuse it when retrying the *same* submission: a request with a key that was already used returns the original payment with `200 OK` (and the header `Idempotent-Replayed: true`) instead of creating a duplicate.

```json
{
  "fromAccountId": 1,
  "toIban": "SE6250000000054910000099",
  "amount": "12500.00",
  "reference": "Faktura #2001"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `fromAccountId` | number | Yes | Account to pay from. Must belong to the logged-in user's tenant |
| `toIban` | string | Yes | Recipient IBAN. Spaces and lower case are accepted and normalized. Validated with MOD97 |
| `amount` | string | Yes | Decimal string, greater than 0, at most two decimals |
| `reference` | string | No | Free text, max 100 characters |

#### `201 Created`

```json
{
  "id": 101,
  "status": "pending_approval",
  "fromAccountId": 1,
  "toIban": "SE6250000000054910000099",
  "amount": "12500.00",
  "currency": "SEK",
  "reference": "Faktura #2001",
  "createdAt": "2026-09-02T10:30:00Z"
}
```

`status` is `completed` at or below the approval threshold, otherwise `pending_approval`. Currency is always `SEK`.

| Field | Type | Description |
|---|---|---|
| `id` | number | Newly created payment's id |
| `status` | string | `completed` if under the approval threshold, otherwise `pending_approval` |
| `fromAccountId` | number | Account the payment was made from |
| `toIban` | string | Recipient IBAN, no spaces |
| `amount` | number | Payment amount |
| `currency` | string | Currently always `SEK` for MVP |
| `reference` | string | Payment reference |
| `createdAt` | string (ISO 8601) | When the payment was created |

---

### GET `/api/payments`

Query parameters (all optional):

Returned when a field is missing, the IBAN format is invalid, the amount is not
greater than 0, or the idempotency key exceeds 128 characters.

```json
{
  "status": 400,
  "title": "BadRequest",
  "detail": "Batchfilen innehåller fel. Inga betalningar har skapats.",
  "validation": { "...": "same shape as the validate response" }
}
```

### `403 Forbidden`

Returned when `fromAccountId` does not belong to the logged-in user's tenant.

```json
{
  "status": 403,
  "title": "Forbidden",
  "detail": "Du har inte behörighet till det kontot."
}
```

### `401 Unauthorized`

Returned when the JWT is missing, invalid, or expired.

```json
{
  "status": 401,
  "title": "Unauthorized",
  "detail": "Åtkomst nekad. Logga in igen."
}
```

### `409 Conflict`

Returned when an idempotency key that already belongs to a payment is reused
with different payment data.

```json
{
  "status": 409,
  "title": "Conflict",
  "detail": "Samma idempotency key har redan använts för en annan betalning."
}
```

---

## Frontend Notes

Frontend can use this contract to:
- build the "Ny betalning" form (account select, IBAN, amount, reference)
- show the correct success message based on returned `status`
- create mock payment responses for both `completed` and `pending_approval` outcomes
- generate one idempotency key when submission starts and reuse that key if the
  same submission is retried; generate a new key only for a new payment

---

## Backend Notes

- Tenant and user always come from the JWT, never from the request.
- IBAN validation uses MOD97 (ISO 13616) with the per-country lengths from the SWIFT IBAN registry: the native `libiban` when it is built into the image, otherwise the managed `IbanValidator` with the same rules (BUG-003).
- The payment, balance change, transaction, approval step, audit entry and notification are committed in one database transaction (`UnitOfWork`).
- The approval thresholds come only from `PaymentRules` (BUG-006).
- Errors are thrown as custom exceptions and turned into ProblemDetails by `AppExceptionHandler`.
