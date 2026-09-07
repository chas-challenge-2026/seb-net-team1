## Approvals

**Related tickets:** This contract defines the shape only (US-03, Sprint 1). The real implementation is US-25 (`Skapa approval API utifrån v1 ApprovalInbox`) and US-26 (`Flytta attestlogik till ApprovalService`), Sprint 4. Frontend build-out is US-27. The permission fix noted below is US-28. Whoever picks up those tickets should follow this contract, not redefine it. Update this doc in the same PR if anything changes.

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
      "amount": "8000.00",
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
  "message": "Ogiltig åtgärd."
}
```

### `403 Forbidden`

Returned when the approval step is not assigned to the logged-in attestant (and the user isn't `admin`).

```json
{
  "message": "Du har inte behörighet till detta atteststeg."
}
```

### `404 Not Found`

Returned when the approval step doesn't exist.

### `409 Conflict`

Returned when the approval step has already been decided.

```json
{
  "message": "Det här atteststeget är redan hanterat."
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
- return consistent error responses per the format above

**Out of scope for this contract (belongs to other tickets):**
- Creating approval steps when a payment is first submitted (US-21/US-22)
- Notifying attestants of new pending approvals (US-25/US-26, and the notification queue itself is a separate Could-have)
- Deducting account balance on final approval (US-24)

---

## Important

This contract is a first version and can be changed if frontend or backend needs adjustments.
If the request or response format changes, this document should be updated so the whole team stays aligned.
