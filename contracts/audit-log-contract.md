## Audit Log

**Related tickets:** This contract defines the shape only (US-03, Sprint 1). No user story currently covers implementing this endpoint. One should be added in Sprint 4, alongside the approval work, since audit entries depend on payment and approval actions already existing.

### GET `/api/audit-log`

Returns a paginated list of audit entries for the logged-in user's tenant.

Frontend uses this endpoint to render the Granskningslogg page.

Requires a valid JWT (`Authorization: Bearer <token>`).

---

## Request

No request body.

### Query parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `limit` | number | No | Max number of entries to return. Default `50`. |
| `cursor` | string | No | Pagination cursor for fetching older entries. Omit for the first page. |
| `action` | string | No | Only entries with this action, e.g. `CREATE_PAYMENT` |
| `entityType` | string | No | Only entries about this kind of entity: `payment`, `user` or `batch` |
| `entityId` | number | No | Only entries about this entity id (combine with `entityType`) |

Actions: `LOGIN`, `LOGOUT`, `CREATE_PAYMENT`, `APPROVE_PAYMENT_STEP`, `APPROVE_PAYMENT`, `REJECT_PAYMENT`, `BATCH_UPLOAD`, `USER_CREATED`, `USER_UPDATED`, `PASSWORD_CHANGED`, `PASSWORD_RESET`.

---

## Success Response

### `200 OK`

```json
{
  "entries": [
    {
      "id": 501,
      "action": "CREATE_PAYMENT",
      "entityType": "payment",
      "entityId": 42,
      "description": "Skapade betalning 12500.00 SEK till SE4550000000054910000099",
      "createdAt": "2026-08-30T09:15:00Z",
      "userName": "Lisa Andersson"
    }
  ],
  "nextCursor": "eyJpZCI6NTAxfQ=="
}
```

### Response fields

| Field | Type | Description |
|---|---|---|
| `entries[].id` | number | Audit entry id |
| `entries[].action` | string | Machine-readable action name, e.g. `CREATE_PAYMENT`, `APPROVE_PAYMENT`, `REJECT_PAYMENT` |
| `entries[].entityType` | string | Type of the entity the action was performed on, e.g. `payment` |
| `entries[].entityId` | number | Id of the entity the action was performed on |
| `entries[].description` | string | Human-readable description of what happened |
| `entries[].createdAt` | string (ISO 8601) | When the action happened |
| `entries[].userName` | string | Name of the user who performed the action, or `Systemet` for system-generated entries |
| `nextCursor` | string \| null | Pass as `cursor` to fetch the next page. `null` when there are no more results |

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

### GET `/api/audit-log/verify`

Role `admin`. Recomputes the tenant's whole audit chain and reports the first entry that does not match.

```json
{ "valid": true, "checkedCount": 57, "firstInvalidEntryId": null, "verifiedAt": "2026-09-29T16:19:33Z" }
```

**How the chain works.** Every entry stores `chain_index` (its position in the tenant's chain), `previous_hash` (the previous entry's hash, 64 zeros for the first) and `hash` = HMAC-SHA256 over the entry's content and `previous_hash`, with a key from `Audit__SigningKey`. Editing, deleting, inserting or reordering a row in the database breaks the chain from that row onwards, and without the key a valid hash cannot be recomputed. Entries are signed in the same transaction as the business change they describe, under a per-tenant advisory lock so concurrent writers cannot fork the chain. The `/health` endpoint reports the chain status as well.

---

## Frontend Notes

Frontend can use this contract to:
- render the audit log table
- page through older entries using `nextCursor`
- create mock audit log data for the Granskningslogg page before the backend is ready

---

## Backend Notes

Backend should use this contract to:
- implement `GET /api/audit-log`
- return only entries belonging to the logged-in user's tenant. v1 had no tenant filtering on audit entries at all, so any logged-in user could see every tenant's activity if they guessed the URL. **Implemented:** every entry has its own `tenant_id`
- write every auditable action to one place. v1 wrote some actions to the database and others only to a local file, so entries like batch payments and partial approvals never showed up in this endpoint at all (BUG-008). **Implemented:** the database is the only destination, for every action listed above
- respect `limit`/`cursor` and return `nextCursor` accordingly. v1 hardcoded a limit of 200 with no way to page further
- return consistent ProblemDetails error responses (status, title, detail) per the format above

---

## Important

This contract is a first version and can be changed if frontend or backend needs adjustments.
If the request or response format changes, this document should be updated so the whole team stays aligned.
