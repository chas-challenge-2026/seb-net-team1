# API Contract

This document describes how the React frontend and the .NET backend API should communicate.

The purpose of this contract is to make sure frontend and backend build against the same structure.
Frontend can use this document to create forms and API calls.
Backend can use this document to implement endpoints that return the expected response format.

This reduces misunderstandings such as:
- frontend expecting `accessToken` while backend returns `token`
- frontend expecting `name` while backend returns `userName`
- different formats for error messages
- unclear role names

### Contracts per area

| Area | Contract |
|---|---|
| Auth, roles, conventions | this file |
| Dashboard | [dashboard-contract.md](dashboard-contract.md) |
| Payments, batch upload, export | [payments-contract.md](payments-contract.md) |
| Approvals (attestkorg) | [approvals-contract.md](approvals-contract.md) |
| Accounts and transactions | [accounts-contract.md](accounts-contract.md) |
| Audit log and chain verification | [audit-log-contract.md](audit-log-contract.md) |
| Notifications | [notifications-contract.md](notifications-contract.md) |
| Users (admin) | [users-contract.md](users-contract.md) |
| Reports, config, IBAN validation | [reports-and-reference-contract.md](reports-and-reference-contract.md) |

---

## Conventions (all endpoints)

- All endpoints live under `/api`. JSON uses camelCase.
- The frontend calls the API with relative URLs (`/api/...`): Vite proxies them to the backend in development, and in Docker the backend serves the frontend on the same origin.
- **Money** is always a decimal string with two decimals (`"12500.00"`), in requests and responses. Never a float.
- **Dates** are ISO 8601 in UTC with `Z` (`"2026-09-29T15:01:51.035939Z"`). Date-only query parameters use `YYYY-MM-DD`.
- **Errors** are RFC 7807 ProblemDetails with a Swedish, user-facing `detail`:

  ```json
  { "status": 400, "title": "BadRequest", "detail": "Beloppet måste vara större än 0." }
  ```

  401 and 403 from authentication/authorization also use this format. Some errors carry extra members, for example the batch upload's `validation`.
- **Paged lists**: `{ "items": [...], "totalCount": 42, "page": 1, "pageSize": 20 }` (page is 1-based).

---

## Auth

The access token is a short lived JWT (15 minutes). The refresh token is **not** in the response body: the backend sets it as an `httpOnly`, `Secure`, `SameSite=Strict` cookie named `seb_refresh` with path `/api/auth`, so scripts can never read it. The frontend keeps the access token in memory only, calls `POST /api/auth/refresh` when the app loads and whenever an API call returns 401, and retries the call once with the new token.

### POST `/api/auth/login`

Logs in a user. Rate limited per IP (10 attempts per minute by default, `RateLimiting:LoginPerMinute`).

```json
{
  "email": "lisa@malmobygg.se",
  "password": "password123"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | The user's email address (case and surrounding spaces are ignored) |
| `password` | string | Yes | The user's password |

#### `200 OK`

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-09-29T15:16:51Z",
  "user": {
    "id": 1,
    "name": "Lisa Persson",
    "email": "lisa@malmobygg.se",
    "role": "initiator",
    "tenantId": 1,
    "tenantName": "Malmö Bygg AB"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `accessToken` | string | JWT for the `Authorization: Bearer` header |
| `expiresAt` | string (ISO 8601) | When the access token expires |
| `user.id` | number | The logged-in user's id |
| `user.name` | string | The logged-in user's name |
| `user.email` | string | The logged-in user's email |
| `user.role` | string | `initiator`, `attestant` or `admin` |
| `user.tenantId` | number | The company/tenant the user belongs to |
| `user.tenantName` | string | The company's name |

Also sets the `seb_refresh` cookie.

#### Errors

| Status | When | `detail` |
|---|---|---|
| 400 | Email or password missing | `E-post och lösenord måste anges.` |
| 401 | Wrong email or password, or the user is deactivated (same answer for all, so the endpoint does not reveal which e-mail addresses exist) | `Fel e-post eller lösenord.` |
| 429 | Too many attempts | `För många inloggningsförsök. Vänta en stund och försök igen.` |

### POST `/api/auth/refresh`

No body; uses the `seb_refresh` cookie. Returns the same `200 OK` body as login and **rotates** the cookie: the old refresh token can never be used again. If an already used token is presented, it is treated as stolen and the whole session (token family) is revoked. Returns `401` when the cookie is missing, expired, revoked or the user is deactivated (the cookie is cleared).

### POST `/api/auth/logout`

No body. Revokes the session's refresh tokens and clears the cookie. `204 No Content`.

### GET `/api/auth/me`

Requires a JWT. Returns the `user` object from the login response.

### POST `/api/auth/change-password`

Requires a JWT.

```json
{ "currentPassword": "password123", "newPassword": "ett-nytt-losenord" }
```

`204 No Content`. `400` when the current password is wrong (`Nuvarande lösenord stämmer inte.`) or the new one is shorter than 8 characters.

---

## Roles

| Role | Description |
|---|---|
| `initiator` | Creates payments (single and batch) |
| `attestant` | Approves or rejects payments. Does not create payments (segregation of duties) |
| `admin` | Everything an initiator and attestant can do, plus user management and audit chain verification |

Nobody, not even an admin, can approve a payment they created themselves (four-eyes principle), and one person can only approve one step of a payment that needs two approvals.

---

## Authentication Header

After login, frontend includes the access token in protected API requests.

```http
GET /api/accounts
Authorization: Bearer jwt-token-here
```

A missing, invalid or expired token gives:

```json
{ "status": 401, "title": "Unauthorized", "detail": "Åtkomst nekad. Logga in igen." }
```

A valid token without the required role gives `403` with `Du har inte behörighet till den här funktionen.`

---

## Backend Notes

- Passwords are hashed with BCrypt (never MD5, BUG-002) and verified in constant time; an unknown e-mail takes as long as a wrong password.
- The login query is a parameterized EF Core query (no string concatenation, BUG-001).
- `LOGIN`, `LOGOUT` and `PASSWORD_CHANGED` are written to the audit log.
- Only the SHA-256 of each refresh token is stored (`refresh_tokens` table).
- The JWT signing key comes from `Jwt__Key`. Without it the API generates a random key per process; users then silently get a new access token through their refresh token after a restart.

---

## Important

This contract can be changed if frontend or backend needs adjustments.
If the request or response format changes, this document should be updated so the whole team stays aligned.
