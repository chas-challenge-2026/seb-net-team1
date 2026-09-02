# API Contract

This document describes how the React frontend and the .NET backend API should communicate.

The purpose of this contract is to make sure frontend and backend build against the same structure.  
Frontend can use this document to create forms, API calls and mock data.  
Backend can use this document to implement endpoints that return the expected response format.

This reduces misunderstandings such as:
- frontend expecting `accessToken` while backend returns `token`
- frontend expecting `name` while backend returns `userName`
- different formats for error messages
- unclear role names

---

## Auth

### POST `/api/auth/login`

Logs in a user and returns a JWT access token plus basic user information.

Frontend uses this endpoint when a user submits the login form.

---

## Request

```json
{
  "email": "lisa@malmobygg.se",
  "password": "password123"
}
```

### Request fields

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | The user's email address |
| `password` | string | Yes | The user's password |

---

## Success Response

### `200 OK`

Returned when the email and password are correct.

```json
{
  "accessToken": "jwt-token-here",
  "user": {
    "id": 1,
    "name": "Lisa Andersson",
    "email": "lisa@malmobygg.se",
    "role": "initiator",
    "tenantId": 1
  }
}
```

### Response fields

| Field | Type | Description |
|---|---|---|
| `accessToken` | string | JWT token used for authenticated API requests |
| `user.id` | number | The logged-in user's id |
| `user.name` | string | The logged-in user's name |
| `user.email` | string | The logged-in user's email |
| `user.role` | string | The user's role in the system |
| `user.tenantId` | number | The company/tenant the user belongs to |

---

## Error Responses

### `401 Unauthorized`

Returned when email or password is incorrect.

```json
{
  "message": "Fel e-post eller lösenord."
}
```

### `400 Bad Request`

Returned when email or password is missing.

```json
{
  "message": "E-post och lösenord måste anges."
}
```

---

## Roles

Possible roles:

| Role | Description |
|---|---|
| `initiator` | Can create payments |
| `attestant` | Can approve or reject payments |
| `admin` | Can access administrative functionality |

---

## Authentication Header

After login, frontend should include the JWT token in protected API requests.

```http
Authorization: Bearer jwt-token-here
```

Example:

```http
GET /api/accounts
Authorization: Bearer jwt-token-here
```

---

## Frontend Notes

Frontend can use this contract to:
- build the login form
- know what fields to send
- create mock login responses
- know where to store the token
- know what error messages to handle

Example mock response:

```ts
const mockLoginResponse = {
  accessToken: "fake-jwt-token",
  user: {
    id: 1,
    name: "Lisa Andersson",
    email: "lisa@malmobygg.se",
    role: "initiator",
    tenantId: 1
  }
};
```

---

## Backend Notes

Backend should use this contract to:
- implement `POST /api/auth/login`
- validate that email and password are provided
- verify the user's password securely
- return a JWT token on successful login
- return consistent error responses
- include user id, role and tenant id in the login result

---

## Important

This contract is a first version and can be changed if frontend or backend needs adjustments.  
If the request or response format changes, this document should be updated so the whole team stays aligned.