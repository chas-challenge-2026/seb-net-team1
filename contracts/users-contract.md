## Users (admin)

User administration for the admin's own tenant. All endpoints require a valid JWT with role `admin`.

### User

```json
{
  "id": 4,
  "name": "Erik Lind",
  "email": "erik@malmobygg.se",
  "role": "attestant",
  "isActive": true,
  "createdAt": "2026-03-01T08:00:00Z"
}
```

### GET `/api/users`

`200 OK` with the tenant's users, ordered by name.

### POST `/api/users`

```json
{ "name": "Erik Lind", "email": "erik@malmobygg.se", "role": "attestant", "password": "ett-startlosenord" }
```

| Field | Rules |
|---|---|
| `name` | 2–100 characters |
| `email` | Valid e-mail address, unique across the system (stored in lower case) |
| `role` | `initiator`, `attestant` or `admin` |
| `password` | At least 8 characters. Stored as a BCrypt hash |

`201 Created` with the user. `400` for invalid data, `409` when the e-mail is taken.

### PUT `/api/users/{id}`

```json
{ "name": "Erik Lind", "role": "admin", "isActive": true }
```

`200 OK` with the user. Deactivating a user revokes all their sessions immediately; a deactivated user cannot log in or refresh. `400` when an admin tries to remove their own admin role or deactivate themselves (so the tenant is never left without an admin). `404` when the user is not in the admin's tenant.

### POST `/api/users/{id}/reset-password`

```json
{ "newPassword": "ett-nytt-losenord" }
```

`204 No Content`. Revokes the user's sessions. `400` when the password is shorter than 8 characters.

---

Every change is written to the audit log: `USER_CREATED`, `USER_UPDATED`, `PASSWORD_RESET` (and `PASSWORD_CHANGED` when users change their own password, see [API.md](API.md)).
