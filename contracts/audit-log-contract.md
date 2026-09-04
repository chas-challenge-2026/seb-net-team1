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
  "message": "Åtkomst nekad. Logga in igen."
}
```

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
- return only entries belonging to the logged-in user's tenant. v1 had no tenant filtering on audit entries at all, so any logged-in user could see every tenant's activity if they guessed the URL. Fixing this likely needs a schema change (linking entries to a tenant, not just a user), which belongs to the data model work in US-06, not this contract
- write every auditable action to one place. v1 wrote some actions to the database and others only to a local file, so entries like batch payments and partial approvals never showed up in this endpoint at all (BUG-008). This contract assumes a single source of truth going forward. Whoever implements the write side of audit logging should make sure nothing is file-only anymore
- respect `limit`/`cursor` and return `nextCursor` accordingly. v1 hardcoded a limit of 200 with no way to page further
- return consistent error responses per the format above

---

## Important

This contract is a first version and can be changed if frontend or backend needs adjustments.
If the request or response format changes, this document should be updated so the whole team stays aligned.
