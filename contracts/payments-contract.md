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

---

### POST `/api/payments`

Headers: `Idempotency-Key: <uuid>` (optional, max 64 characters). Generate one per form submission and reuse it when retrying the *same* submission: a request with a key that was already used returns the original payment with `200 OK` (and the header `Idempotent-Replayed: true`) instead of creating a duplicate.

```json
{
  "fromAccountId": 1,
  "toIban": "SE3550000000054910000003",
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
  "toIban": "SE3550000000054910000003",
  "amount": "12500.00",
  "currency": "SEK",
  "reference": "Faktura #2001",
  "createdAt": "2026-09-02T10:30:00Z"
}
```

`status` is `completed` at or below the approval threshold, otherwise `pending_approval`. Currency is always `SEK`.

#### Errors

| Status | When |
|---|---|
| 400 | Missing account, amount not > 0 or more than two decimals, reference too long, invalid IBAN (the `detail` says why, e.g. `IBAN:ets kontrollsiffror stämmer inte (MOD97).`), recipient is the source account, not enough available balance (`Kontot har inte tillräckligt saldo för denna betalning.`) |
| 403 | The caller is an attestant |
| 404 | The account does not exist in the caller's tenant (same answer as "belongs to another tenant", so ids are not leaked) |
| 409 | The account kept changing concurrently and the retries ran out |

---

### GET `/api/payments`

Query parameters (all optional):

| Parameter | Description |
|---|---|
| `status` | `pending_approval`, `completed` or `rejected` |
| `accountId` | Source account |
| `search` | Matches the reference (case insensitive), the recipient IBAN (spaces ignored) or the payment id (`42` or `#42`) |
| `fromDate`, `toDate` | `YYYY-MM-DD`, inclusive, on the creation date |
| `createdByMe` | `true` for only the caller's own payments |
| `page`, `pageSize` | Defaults 1 and 20, max page size 100 |

Newest first. Returns a paged list of:

```json
{
  "id": 12,
  "fromAccountId": 1,
  "fromAccountName": "Driftkonto",
  "toIban": "SE3550000000054910000003",
  "amount": "75000.00",
  "currency": "SEK",
  "reference": "Faktura #1043",
  "status": "pending_approval",
  "createdAt": "2026-09-24T09:12:00Z",
  "executedAt": null,
  "createdById": 1,
  "createdByName": "Lisa Persson",
  "source": "manual",
  "approvalProgress": { "approved": 0, "required": 1 }
}
```

`source` is `manual` or `batch`. `approvalProgress` is `null` for payments that never needed attest.

### GET `/api/payments/{id}`

The list item plus:

```json
{
  "fromAccountIban": "SE4550000000058398257466",
  "requiresApproval": true,
  "requiresDoubleApproval": false,
  "approvalSteps": [
    { "id": 7, "stepNumber": 1, "attestantId": 2, "attestantName": "Johan Berg",
      "status": "pending", "decidedAt": null, "comment": null }
  ],
  "myApprovalStepId": 7,
  "events": [
    { "id": 51, "action": "CREATE_PAYMENT", "entityType": "payment", "entityId": 12,
      "description": "Betalning #12 på 75 000,00 SEK ...", "createdAt": "...", "userName": "Lisa Persson" }
  ]
}
```

- `myApprovalStepId`: the step the caller may decide right now (same rules as the approvals endpoint), otherwise `null`. The frontend shows Godkänn/Avvisa only when it is set.
- `events`: the payment's audit trail, oldest first.

`404` when the payment does not exist in the caller's tenant.

### GET `/api/payments/export`

Same filters as the list, no paging (max 10 000 rows). Returns `text/csv` as a download (`betalningar-YYYYMMDD.csv`): semicolon separated, UTF-8 with BOM, Swedish decimal comma and Swedish local times, so it opens directly in Excel. Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` (CSV injection). The frontend must fetch it with the Authorization header and save the blob.

---

### Batch upload

CSV format (RFC 4180): a header row, then one payment per row. Fields containing commas, quotes or line breaks are quoted, and quotes inside quoted fields are doubled. Blank lines are ignored, a UTF-8 BOM is accepted, and unquoted fields are trimmed.

```
from_account_id,to_iban,amount,reference
1,SE3550000000054910000003,5000.00,Faktura #2001
1,SE7850000000054910000005,12500.00,"Malmö Bygg, faktura 2003"
```

Limits: `Batch:MaxFileSizeBytes` (1 MB) and `Batch:MaxRows` (1000), enforced before parsing (BUG-012). The native `libcsvparser` is used when it is available (Docker image), otherwise the managed parser with the same rules.

#### POST `/api/payments/batch/validate`

`multipart/form-data` with the field `file`. Nothing is created.

```json
{
  "fileName": "betalningar.csv",
  "parser": "native",
  "rowCount": 3,
  "validRowCount": 2,
  "invalidRowCount": 1,
  "totalAmount": "17500.00",
  "directPaymentCount": 2,
  "approvalRequiredCount": 0,
  "fileErrors": [],
  "rows": [
    { "rowNumber": 2, "fromAccountId": 1, "fromAccountName": "Driftkonto", "toIban": "SE3550000000054910000003",
      "amount": "5000.00", "reference": "Faktura #2001", "requiresApproval": false, "errors": [] },
    { "rowNumber": 4, "fromAccountId": 1, "fromAccountName": "Driftkonto", "toIban": "SE8550000000054910000003",
      "amount": "100.00", "reference": "Fel IBAN", "requiresApproval": false,
      "errors": ["IBAN:ets kontrollsiffror stämmer inte (MOD97)."] }
  ],
  "isValid": false
}
```

- `rowNumber` is the line in the file (the header is line 1).
- `fileErrors`: problems with the file itself (empty, too large, wrong header, broken quoting, too many rows). When present, `rows` is empty.
- Every row is checked like a single payment, and the available balance counts the earlier rows of the same file.
- `totalAmount` and the counts only include valid rows.

#### POST `/api/payments/batch`

Same body (plus an optional `Idempotency-Key`). **All or nothing**: either every row becomes a payment in one database transaction, or none does (v1 committed row by row, BUG-005).

`201 Created`:

```json
{
  "createdCount": 3,
  "completedCount": 2,
  "pendingApprovalCount": 1,
  "totalAmount": "17500.00",
  "payments": [ { "id": 31, "status": "completed", "...": "same shape as POST /api/payments" } ]
}
```

`400` when the file is invalid, with the validation result attached:

```json
{
  "status": 400,
  "title": "BadRequest",
  "detail": "Batchfilen innehåller fel. Inga betalningar har skapats.",
  "validation": { "...": "same shape as the validate response" }
}
```

Each created payment gets a `CREATE_PAYMENT` audit entry ("via batchfil"), and the upload gets one `BATCH_UPLOAD` entry. v1 only wrote batch events to a file (BUG-008).

---

## Backend Notes

- Tenant and user always come from the JWT, never from the request.
- IBAN validation uses MOD97 (ISO 13616) with the per-country lengths from the SWIFT IBAN registry: the native `libiban` when it is built into the image, otherwise the managed `IbanValidator` with the same rules (BUG-003).
- The payment, balance change, transaction, approval step, audit entry and notification are committed in one database transaction (`UnitOfWork`).
- The approval thresholds come only from `PaymentRules` (BUG-006).
- Errors are thrown as custom exceptions and turned into ProblemDetails by `AppExceptionHandler`.
