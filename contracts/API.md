# API Contract

This document describes how the React frontend and the .NET backend API should communicate.

The purpose of this contract is to make sure frontend and backend build against the same structure.
Frontend can use this document to create forms and API calls.
Backend can use this document to implement endpoints that return the expected response format.

This reduces misunderstandings such as:
- frontend expecting a token in JSON while backend uses a cookie
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

The JWT signing key stays in the backend. Login sets the JWT in an HttpOnly cookie;
the response body contains user information only. Never store JWTs in browser storage.
For local setup without Docker, see [Create and save a JWT signing key](../README.md#jwt-nyckel-för-lokal-körning-utan-docker).

### POST `/api/auth/login`

Logs in a user, sets the authentication cookie and returns basic user information.
Requires the CSRF header described under [Browser authentication](#browser-authentication).

Frontend uses this endpoint when a user submits the login form.

---

## Request

```json
{
  "email": "lisa@malmobygg.se",
  "password": "<your-local-test-password>"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | The user's email address (case and surrounding spaces are ignored) |
| `password` | string | Yes | The user's password |

#### `200 OK`

```json
{
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

### `400 Bad Request`

Returned when email or password is missing, or CSRF validation fails.

```json
{
  "message": "E-post och lösenord måste anges."
}
```

---

## Roles

| Role | Description |
|---|---|
| `initiator` | Creates payments (single and batch) |
| `attestant` | Approves or rejects payments. Does not create payments (segregation of duties) |
| `admin` | Everything an initiator and attestant can do, plus user management and audit chain verification |

Nobody, not even an admin, can approve a payment they created themselves (four-eyes principle), and one person can only approve one step of a payment that needs two approvals.

---

## Browser authentication

Use `apiRequest` from `frontend/src/api/apiClient.ts` for real backend calls under
`/api`. It sends cookies with `credentials: 'include'` and obtains a fresh CSRF
token before each POST, PUT, PATCH or DELETE. The existing mock API is separate.

1. GET `/api/auth/csrf` with credentials included. The server sets an HttpOnly
   CSRF cookie and returns `{ "requestToken": "..." }`. This value is a CSRF token,
   not a JWT, and does not authenticate a user.
2. POST `/api/auth/login` with credentials included, JSON email/password and the
   `X-CSRF-TOKEN` header set to that request token. A successful response sets
   `SebPortal.Auth` (`HttpOnly`, `SameSite=Strict`, `Path=/api`, expires with the
   JWT after two hours). `Secure` is the default; local HTTP has an explicit override.
3. GET protected endpoints such as `/api/dashboard` with credentials included.
   The browser sends the cookie; JavaScript does not read the JWT.
4. Before changing data, obtain a fresh CSRF token and include it as
   `X-CSRF-TOKEN`. Tokens are bound to the current identity, which changes on login.
   Missing or invalid CSRF gives **400**. Missing, invalid or expired JWT gives
   **401** on protected endpoints.
5. POST `/api/auth/logout` with credentials and a fresh CSRF token. **204** expires
   the auth cookie. Further protected requests return **401**. This clears the
   browser session; an independently copied JWT remains valid until it expires.

The JWT is never returned in login JSON. Login/logout require CSRF validation
even when anonymous. Auth responses must not be cached. Local Vite origins
`http://localhost:5173` and `http://localhost:5174` are allowed with credentials;
Docker serves frontend and API from the same origin.

Non-browser clients that already hold a JWT may still send `Authorization: Bearer …`.
Valid bearer-only requests to protected endpoints do not need CSRF. If an auth
cookie is also present, CSRF remains required for changes. An explicit invalid
Authorization header never falls back to the cookie. Login no longer issues
tokens in JSON, so existing scripts must use a cookie jar and the CSRF flow above.

A missing, invalid or expired token gives:

## Frontend Notes

Frontend can use this contract to:
- build the login form
- know what fields to send
- create mock login responses
- send cookies and the CSRF header correctly
- know what error messages to handle

Example mock response:

```ts
const mockLoginResponse = {
  user: {
    id: 1,
    name: "Lisa Andersson",
    email: "lisa@malmobygg.se",
    role: "initiator",
    tenantId: 1
  }
};
```

A valid token without the required role gives `403` with `Du har inte behörighet till den här funktionen.`

---

## Backend Notes

Backend should use this contract to:
- implement `POST /api/auth/login`
- validate that email and password are provided
- verify the user's password securely
- set the HttpOnly authentication cookie on successful login
- validate CSRF on login, logout and requests that change data using cookies
- return consistent error responses
- include user id, role and tenant id in the login result

---

## Important

This contract is a first version and can be changed if frontend or backend needs adjustments.  
If the request or response format changes, this document should be updated so the whole team stays aligned.
