# Login frontend readiness

## Scope and sources

The approved Figma is the visual reference. Functional authentication requirements
come from `contracts/API.md` (Auth and Browser authentication), implemented by
`backend/SebPortal.Api/Controllers/AuthController.cs`, `DTOs/LoginRequest.cs`,
`Auth/AuthCookie.cs` and `Auth/JwtTokenService.cs`.

No remember-me option, password recovery API or SEB ID integration is defined in
the current API contract or implemented in the current AuthController.
`docs/README-pain-points.md` lists password recovery as missing legacy functionality;
it is not an implementation specification. No endpoint, identity protocol, reset
token format or password policy is proposed as an agreed contract here.

## Confirmed existing authentication

- `/` is the email/password login page. The Figma label is "Användarnamn", but the
  required input remains `type="email"` with `autocomplete="username"`.
- `login(email, password)` in `frontend/src/api/usersApi.ts` uses the shared
  `apiRequest` in `frontend/src/api/apiClient.ts`. Its payload remains exactly
  `{ email, password }` to `POST /api/auth/login`.
- The client first obtains a fresh token from `GET /api/auth/csrf`, then sends
  `X-CSRF-TOKEN` with credentials included. API URLs still use `apiConfig.ts`.
- Successful login returns `{ user }`. The backend sets the HttpOnly
  `SebPortal.Auth` cookie, SameSite Strict, Path `/api`, Secure by default. Its
  expiry matches the current two-hour JWT lifetime, regardless of the checkbox.
- Only the existing user display metadata is saved to localStorage; JWTs and
  passwords are not stored there. Login redirects to `/dashboard` as before.
- Existing logout still uses `POST /api/auth/logout` through the same cookie/CSRF
  client, removes user display metadata and returns to `/`. It was not modified.
- Existing login error text is preserved: "Fel e-post eller lösenord." Native
  required/email validation runs before submission; failed login retains inputs.

## Completed frontend behavior

- Figma two-column desktop layout, existing building/logo assets, input icons,
  password visibility toggle, submitting state and accessible error feedback.
- Selectable remember-me checkbox with label and keyboard support. Its value is
  React state only, resets on unmount/reload, is not persisted or sent to the API,
  and does not alter the cookie or session lifetime. This limitation is visible.
- "Glömt lösenord?" navigates to `/forgot-password`, with its own document title,
  required email field, native email-format validation, back link and focused
  page heading. Browser Back/Forward and direct links use normal React routing.
- Recovery validates the local form but deliberately makes no HTTP request. A
  valid submission displays an explicit blocked/error message stating that the
  service is not connected and no email has been sent. Editing clears that message.
- SEB ID is a keyboard-accessible button. Clicking announces that integration is
  pending and directs the user to email/password login; no request, external
  redirect, token or authentication success is simulated.
- `components/auth/LoginLayout.tsx` reuses the same shell/footer for both pages.
  `AuthFeedback.tsx` provides reusable info/loading/error presentation; a loading
  state is used only for real work, not a fabricated recovery/network operation.
- Support displays `077-136 53 65` linked to `tel:0771365365`.
- Login CSS is scoped to `.login-page`. Compact desktop height adjustments avoid
  the former 760px panel minimum and excess viewport-based spacing. Short screens
  retain real vertical scrolling; inputs, feedback and the footer are not hidden.

## Backend dependencies and decisions

All items below require backend/team approval. They are dependencies, not newly
defined API contracts or claims that integration is complete.

### Remember me

Decide whether the product should support longer authentication, and define the
opt-in request field (if any), type/default, checked versus unchecked lifetimes,
cookie persistence, JWT lifetime, expiry/revocation and logout semantics. The
backend must own these decisions and enforce them. Unchecked currently does not
mean "session cookie only"; both choices still use the existing two-hour cookie.
Frontend can wire the local checkbox to the approved request only after agreement.
Do not implement this with browser token/password storage.

### Password recovery

Specify the real request method/path, email field and DTO, acknowledgement/error
shapes and status codes, CSRF/anonymous access requirements, rate limits and email
delivery readiness. Decide generic acknowledgement wording that does not reveal
whether an account exists. Separately define the genuine reset journey: approved
navigation, token delivery/expiry/single use, password policy, confirmation DTO,
session invalidation and expired/invalid-token errors. These are not inferred from
the new frontend route. No reset-token entry or new-password screen is implemented
because their requirements are not defined. Local email syntax is not proof of
account existence or successful email delivery.

### SEB ID

Agree the identity provider/protocol and backend-owned entry/callback mechanism,
trusted destinations, origin/CSRF/state protections, cancellation/failure/timeout
responses, tenant/user provisioning and role mapping. Define how a successful
identity flow creates the project's existing HttpOnly authentication cookie and
where navigation resumes. Frontend must not generate tokens, pick roles, or guess
provider URLs. Until these decisions exist, the button only displays pending feedback.

## Expected integration states

| Flow | Current frontend | After an approved real integration |
|---|---|---|
| Email/password | Native validation, pending button/announcement, safe error, redirect on actual login success | Preserve existing cookie/CSRF behavior |
| Remember me | Checked/unchecked preference and visible no-effect note | Send only the agreed field; verify server-controlled lifetime, then remove the note |
| Recovery | Idle form, native validation, explicit blocked error; no fake loading/success | Disable duplicate submits while a real request is pending; show neutral acknowledgement only after confirmed response; preserve input on safe error |
| SEB ID | Announced pending integration; no authentication or external navigation | Start only the approved identity journey; handle cancel/error/timeout and confirmed successful login |

## Security and authorization

Keep using the existing API client, credentialed requests and fresh CSRF tokens.
Do not weaken cookie/CORS/security settings. Do not log credentials, tokens or
cookies, store passwords/JWTs in browser storage, or render raw backend errors.
Do not infer roles or authorize from checkbox state or cached user metadata;
backend claims remain authoritative. Recovery must avoid account enumeration and
must not bypass authentication or invent privileges.

## Integration and verification handoff

1. Backend/team agrees and publishes the missing contracts and security decisions.
2. Extend the existing auth API layer with only those documented capabilities;
   keep URLs/fetch logic outside page components and reuse `apiRequest` as appropriate.
3. Replace recovery's local blocked state with the genuine request lifecycle.
   Reuse `AuthFeedback` for pending/error states and acknowledge only real success.
4. Wire remember-me and SEB ID strictly to the approved flow; remove pending notes
   only when their effects are real and tested.
5. Test actual email delivery/reset, cookie lifetimes, cancellation, errors, CSRF,
   rate limiting, logout and browser navigation in the agreed development environment.

Frontend tests use isolated responses and temporary browser profiles on localhost.
They verify UI/payload/CSRF/redirect behavior, not real recovery, identity-provider
integration, email delivery or a new live-backend login. Manual review and genuine
end-to-end integration remain separate gates before claiming those capabilities.
