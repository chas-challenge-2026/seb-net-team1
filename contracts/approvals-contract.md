## Approvals

**Related tickets:** This contract defines the shape only (US-03, Sprint 1). The real implementation is US-25 (`Skapa approval API utifrån v1 ApprovalInbox`) and US-26 (`Flytta attestlogik till ApprovalService`), Sprint 4. Frontend build-out is US-27. The permission fix noted below is US-28. Whoever picks up those tickets should follow this contract, not redefine it. Update this doc in the same PR if anything changes.

### Approval rules (implemented)

- **Who gets the step.** Step 1 is assigned when the payment is created, to an active attestant (preferred) or admin who is not the creator. For payments above the double approval threshold, step 2 is created when step 1 is approved, assigned to someone who is neither the creator nor the step 1 approver. When nobody qualifies, the step is left unassigned and every eligible admin is notified.
- **Inbox.** Attestants see the steps assigned to them. Admins see every pending step in the tenant, including unassigned ones, except on payments they created themselves.
- **Four-eyes principle.** Nobody can decide a step on a payment they created (`403`), and one person can only approve one step of a payment (`403`). When an admin decides a step assigned to someone else, the step is recorded as decided by the admin.
- **Completion.** The last approval completes the payment: balance, transaction and status are written together, guarded by optimistic locking. A rejection rejects the payment and closes any other open step.
- **Notifications.** The assigned attestant is notified when a step is waiting for them, and the creator when the payment is completed or rejected (see [notifications-contract.md](notifications-contract.md)).
- **Audit.** `APPROVE_PAYMENT_STEP` (a step approved, more remain), `APPROVE_PAYMENT` (final approval, payment completed) and `REJECT_PAYMENT` are written to the audit log in the same transaction as the decision.

---

### GET `/api/approvals`

Returns the logged-in attestant's pending approvals and their recently handled approvals.

Frontend uses this endpoint to render the Attestkorg page.

Requires a valid JWT (`Authorization: Bearer <token>`), role `attestant` or `admin`.

---

## Request

No request body, no query parameters for MVP.

---

## Success Response

### `200 OK`

```json
{
  "pending": [
    {
      "paymentId": 42,
      "approvalStepId": 501,
      "toIban": "SE4550000000054910000099",
      "amount": "250000.00",
      "currency": "SEK",
      "reference": "Faktura 2026-114",
      "createdAt": "2026-08-30T09:15:00Z",
      "createdByName": "Lisa Andersson",
      "fromAccountName": "Företagskonto",
      "currentStep": 1,
      "totalSteps": 2,
      "requiresDoubleApproval": true
    }
  ],
  "recentlyHandled": [
    {
      "paymentId": 40,
      "approvalStepId": 498,
      "stepNumber": 1,
      "amount": "8000.00",
      "currency": "SEK",
      "reference": "Faktura #1990",
      "toIban": "SE3550000000054910000003",
      "status": "approved",
      "decidedAt": "2026-08-29T14:00:00Z",
      "comment": ""
    }
  ]
}
```

### Response fields

| Field | Type | Description |
|---|---|---|
| `pending[].paymentId` | number | Id of the payment awaiting approval |
| `pending[].approvalStepId` | number | Id of this specific approval step. Used when approving or rejecting |
| `pending[].toIban` | string | Recipient IBAN, no spaces |
| `pending[].amount` | string | Payment amount, as a decimal string |
| `pending[].currency` | string | Currency code |
| `pending[].reference` | string | Payment reference |
| `pending[].createdAt` | string (ISO 8601) | When the payment was created |
| `pending[].createdByName` | string | Name of the user who created the payment |
| `pending[].fromAccountName` | string | Display name of the source account |
| `pending[].currentStep` | number | Which approval step this is (1-indexed) |
| `pending[].totalSteps` | number | Total approval steps required for this payment |
| `pending[].requiresDoubleApproval` | boolean | Whether this payment needs a second attestant. Backend-computed. Frontend must not infer this from the amount itself |
| `recentlyHandled[].paymentId` | number | Payment id |
| `recentlyHandled[].approvalStepId` | number | The step this attestant decided |
| `recentlyHandled[].stepNumber` | number | Which step it was |
| `recentlyHandled[].currency` | string | Currency code |
| `recentlyHandled[].reference` | string | Payment reference |
| `recentlyHandled[].toIban` | string | Recipient IBAN |
| `recentlyHandled[].amount` | string | Payment amount, as a decimal string |
| `recentlyHandled[].status` | string | `approved` or `rejected` |
| `recentlyHandled[].decidedAt` | string (ISO 8601) | When this attestant made their decision |
| `recentlyHandled[].comment` | string | Optional comment left by the attestant |

---

### POST `/api/approvals/{approvalStepId}/decision`

Approves or rejects a specific approval step.

Frontend uses this endpoint when an attestant clicks "Godkänn" or "Avvisa" on a pending payment.

Requires a valid JWT, role `attestant` or `admin`.

## Request

```json
{
  "action": "approve",
  "comment": "Ser korrekt ut"
}
```

### Request fields

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | string | Yes | `approve` or `reject` |
| `comment` | string | No | Free-text comment, max 255 chars |

---

## Success Response

### `200 OK`

```json
{
  "paymentId": 42,
  "approvalStepId": 501,
  "stepStatus": "approved",
  "paymentStatus": "pending_approval"
}
```

### Response fields

| Field | Type | Description |
|---|---|---|
| `paymentId` | number | The payment this decision applies to |
| `approvalStepId` | number | The approval step that was decided |
| `stepStatus` | string | `approved` or `rejected` |
| `paymentStatus` | string | The payment's resulting status: `completed`, `pending_approval` (if more steps remain), or `rejected` |

---

## Error Responses

### `400 Bad Request`

Returned when `action` is missing or not one of `approve`/`reject`, or `comment` exceeds 255 chars.

```json
{
  "status": 400,
  "title": "BadRequest",
  "detail": "Ogiltig åtgärd."
}
```

### `403 Forbidden`

Returned when the approval step is not assigned to the logged-in attestant (and the user isn't `admin`), when the caller created the payment (`Du kan inte attestera en betalning som du själv har skapat.`), or when the caller already approved another step of the same payment.

```json
{
  "status": 403,
  "title": "Forbidden",
  "detail": "Du har inte behörighet till detta atteststeg."
}
```

### `404 Not Found`

Returned when the approval step doesn't exist.

```json
{
  "status": 404,
  "title": "NotFound",
  "detail": "Atteststeget hittades inte."
}
```

### `409 Conflict`

Returned when the approval step has already been decided, the payment is no longer pending, or someone else changed the payment or account at the same moment. A final approval that the account can no longer cover returns `400` (`Kontot har inte tillräckligt saldo för denna betalning.`) and changes nothing.

```json
{
  "status": 409,
  "title": "Conflict",
  "detail": "Det här atteststeget är redan hanterat."
}
```

### `401 Unauthorized`

Returned when the JWT is missing, invalid, or expired.

---

## Frontend Notes

Frontend can use this contract to:
- render the pending approvals list with the "Dubbel attest krävs" badge driven by `requiresDoubleApproval`, not a hardcoded amount check
- render the recently handled table
- submit approve/reject decisions with an optional comment
- create mock approval data for the Attestkorg page before the backend is ready

---

## Backend Notes

Backend should use this contract to:
- implement `GET /api/approvals` and `POST /api/approvals/{approvalStepId}/decision`
- scope `pending` to approval steps assigned to the logged-in attestant's own id. Never trust a client-supplied user id. v1 let any attestant approve any step just by knowing its id (BUG-011, IDOR i attestkorgen). This contract exists so v2 checks step ownership before allowing a decision
- compute `requiresDoubleApproval` on the backend from a single shared threshold source. v1 used two different threshold values across `NewPayment.cs` (500 000) and `ApprovalInbox.cs` (200 000) for the same rule (BUG-006). Consolidating that value is part of US-25/US-26, not this contract. The contract's job is just to make sure frontend never has to guess or duplicate the number itself
- return `409` rather than silently reprocessing when a step has already been decided
- represent all money values as decimal strings, never floating-point numbers
- return consistent ProblemDetails error responses (status, title, detail) per the format above
- throw the matching custom exception (ApprovalStepNotFoundException, ApprovalStepAccessDeniedException, ApprovalStepAlreadyDecidedException) rather than returning ad-hoc error objects. The global exception handler converts these to the responses shown above automatically

**Out of scope for this contract (belongs to other tickets):**
- Creating approval steps when a payment is first submitted (US-21/US-22)
- Notifying attestants of new pending approvals (US-25/US-26, and the notification queue itself is a separate Could-have)
- Deducting account balance on final approval (US-24)

---

## Implementation Notes (US-25 / US-26)

Implemented in `backend/SebPortal.Api` as `ApprovalsController` → `ApprovalService` → `ApprovalRepository`. The controller reads the caller's id, tenant and role from the JWT only, and never accepts any of them from the request. Four things are worth knowing on top of the contract above:

- **The double approval threshold now lives in configuration**, `PaymentRules:DoubleApprovalThreshold` (200 000 SEK in `appsettings.json`), next to the existing `ApprovalThreshold`. `requiresDoubleApproval` and `totalSteps` are both derived from it. This is the consolidation BUG-006 called for: payment creation, the approval flow and the frontend badge all read the same value, and changing the rule means changing one setting.
- **Admins see the whole tenant's pending list**, attestants only steps assigned to them. This carries over v1's behaviour and matches the `403` rule above, which already exempts `admin`.
- **A step in another tenant answers `404`, not `403`**, even for an admin. Answering `403` would confirm that the id exists somewhere, which leaks across tenants. v1 let an admin decide steps in any tenant at all.
- **Every decision is audited to the database** as `APPROVE_PAYMENT`, `APPROVE_PAYMENT_STEP` (a step approved while others remain) or `REJECT_PAYMENT`. v1 wrote partial approvals to `/tmp/audit.log` only, so they never reached the audit log UI.

The final approval completes the payment through the same `PaymentService.CompletePaymentOrThrow` a direct payment uses, so status, balance, execution timestamp and transaction history stay consistent between the two paths. If a payment ever reaches its last approval with fewer approvals than the threshold requires, the service creates the missing step (assigned to an attestant who has neither decided nor created the payment) instead of completing early or leaving the payment stuck.

---

## Important

This contract is a first version and can be changed if frontend or backend needs adjustments.
If the request or response format changes, this document should be updated so the whole team stays aligned.
