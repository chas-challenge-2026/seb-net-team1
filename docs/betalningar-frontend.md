# Betalningar frontend

The list and detail views follow the approved Figma layout. They are not a
complete payment-history implementation: the current contracts define creation,
dashboard summaries, approvals and a tenant-wide audit feed, but no payment-list
or payment-by-ID read API.

## Current real connections

- `/payments` reads `GET /api/dashboard` through the shared `apiRequest` and
  displays `recentPayments`, limited by the backend to the latest 20 payments.
- `/payments/:id` reads that same real summary collection. A direct link or
  refresh works only when the requested payment is in this collection. Otherwise
  the page reports unavailable data, not that the payment does not exist.
- Details read `GET /api/audit-log?limit=50` using the unchanged audit API client.
  Only entries with `entityType === "payment"` and the selected numeric
  `entityId` are displayed. This is a limited recent subset, not complete history.
- NewPayment still gets accounts from dashboard and creates through
  `POST /api/payments`. Amount stays a decimal string; submitted IBAN whitespace
  is removed. No new fields or approval rules were added.
- The shared client retains cookie authentication, fresh CSRF for mutations and
  the existing real API base URL configuration. No mock endpoint is used here.

## Presentation without invented capabilities

List and Details IDs use the agreed display-only `PAY-` prefix and five-digit padding
(`1` becomes `PAY-00001`). Routes, API data and audit matching still use the
numeric ID. Details reuse the approved list date formatter for payment creation
and real activity timestamps, preserving the original `time` attributes.
Recipient IBAN is not presented as a company name or Bankgiro. Unknown source-account,
creator, Bankgiro, BIC, country and fee values use neutral dashes. Known payment
statuses remain `completed`, `pending_approval` and `rejected` internally.

Status, date and amount controls filter only the real loaded dashboard subset.
Default filters are all statuses, the latest 30 local calendar days and all amounts.
Date choices are all dates or the latest 7/30/90 days including today; future
timestamps are excluded from the relative ranges. The account control has only
All because summaries do not expose source-account associations. Reset restores
the defaults without refetching. No filter query parameters are sent.

Amount ranges use exact integer minor units: below 10,000; 10,000 inclusive to
50,000 exclusive; 50,000 through 100,000 inclusive; and above 100,000 SEK.
Active SEK amount ranges exclude missing/malformed amounts and other currencies;
no currency conversion or transport mutation is performed. List dates use
Swedish local-date presentation: today/yesterday or day and abbreviated month.

Header search and approval/signing buttons remain unavailable. List pagination
now operates only on the real loaded, filtered collection, with a page size of
10. `getPaymentPagination` derives `totalPages = ceil(totalItems / pageSize)`,
clamps the selected page and generates numbered slots dynamically. Larger page
counts use a bounded first/last/active-page window with ellipses, not a fixed
three-page limit. Filters and reset return to page 1.

The current two real payments produce only page 1, with unavailable previous/next
arrows. The active page is a normal focusable button; clicking it is a harmless
no-op with no request. Empty filtered results have no numbered pages and both
arrows are disabled. The footer reports only filtered and loaded recent counts,
never a payment-history total; multi-page subsets report the displayed range.

The pagination calculation is independent of the data source, so agreed real
server totals can drive the same numbered presentation later. Server integration
must fetch real pages and render those returned rows rather than re-slicing a
server page as though it were the full collection. No server page/filter query
parameters or undocumented endpoints are used now. A complete real collection
could use the current client-side slicing; a dashboard subset is never described
as complete history.

The approval-chain card does not manufacture a two-step chain, approver names,
timestamps or completed steps. Signing is not claimed to exist. No approval or
rejection action is sent without a real authorized approval-step context.
The creator is not inferred from the signed-in user or a matching audit actor.

Details use equal-width, aligned desktop cards in a row sized to available space,
with a usable 280px minimum and 640px maximum. Each heading stays outside its
keyboard-focusable body region. Only overflowing bodies scroll with
`overflow-y: auto`; fitting content does not acquire a permanent scrollbar.
Short desktop viewports retain the approved compact Details-only spacing.
At widths of 1100px or less, bodies return to natural height and normal page
scrolling, without nested scroll regions. Very short desktop windows may also
scroll normally to preserve the usable minimum instead of clipping content.
The bottom approval controls sit in a separate bordered Card with a clear gap.
Unavailable approval requirements stay neutral and both mutation buttons stay
disabled. The limited activity-feed scope is conveyed by a heading tooltip and
an accessible description, not a prominent extra paragraph or a full-history claim.

## Backend and contract follow-up

Rechecked on 2026-10-07 against `origin/develop` at
`a452094c4c77e85c75515eec45b1e1cc1ed56d36`, incorporated by synchronization merge
`d61a68e8406d628ba4f00ebf4dc1011ed87a3676`. The completed frontend files survived
the merge unchanged. No backend message has been sent.

Classification: **A** = now supported; **B** = known/planned backend work or an
already documented backend discrepancy; **C** = still unsupported with no current
implementation work evidenced in the fetched development refs. C does not prove
that no GitHub task exists. Authenticated GitHub PR/issue metadata was unavailable,
so no claim about open issues, assignees or previously sent messages is made.

### Recent backend changes

- **#154: NOT MERGED into the inspected develop.** The planned JSON-number amount
  migration is known from the team request, but `contracts/payments-contract.md`
  still specifies a decimal string. `CreatePaymentRequestDto.Amount` remains a
  C# decimal, and `PaymentsController`/`DashboardService` still serialize response
  amounts as strings. Keep the current string request until the actual contract
  migration merges; do not infer its PR state from inaccessible GitHub metadata.
- **#155: MERGED**, merge `cc71cc9972a269caea850f0083e79854f339de61`.
  `ApprovalStep.PublicId`, the EF mapping, seed schema, approval DTOs, route,
  repository and approval contract now use public UUIDs for approval steps.
  Payment IDs are still numbers. Never use a payment ID as an approval-step ID.
  This does not require changing the currently disabled Details actions.
- **#156: MERGED**, merge `af8df6ae616a5c80d69ab18edbe1872e90031b61`.
  `PaymentService.AddInitialApprovalStepAsync` creates step 1 for payments above
  the approval threshold, selects another tenant attestant and excludes the
  creator. With no candidate, the step is unassigned for an admin. Persistence
  includes the payment and step. Existing subsequent-step/completion behavior
  remains in `ApprovalService`; no general Details read model was added.
- **#149: MERGED.** `native/libiban` supplies country/format/MOD97 and BIC
  validation; `docs/native-iban-usage.md` documents backend interop. The current
  payment controller/service still does not call this library.
- **#147: MERGED.** Login now has configurable IP rate limiting and 429 responses
  (`AuthController`, `Program.cs`, `appsettings.json`). Cookie JWT, shared frontend
  `apiRequest`, credentials and CSRF behavior are unchanged. Dependency/CI merges
  #146/#158/#159/#160 do not add payment read endpoints.

| Area | Class | Current evidence / remaining follow-up |
| --- | --- | --- |
| Full list / dedicated detail | C | `PaymentsController` still only has POST; the payment contract has no list/by-ID GET. Agree tenant-scoped read contracts. |
| Full-list total / server paging | C | `DashboardService` takes 20 recent payments; `DashboardResponse` has no full total or page metadata. Agree and implement real paging. |
| Server filters / search | C | No payment-history query endpoint. Current frontend filters only loaded summaries. |
| Recipient/company display name | C | `PaymentSummaryDto` exposes `toIban`, not recipient metadata. Do not substitute Figma names. |
| Source account / creator in list and Details | C | Models and authorized `PendingApprovalDto` have related data; general dashboard summaries do not. Expose associations through an agreed read model. |
| PAY-xxxxx semantics | C | Numeric payment IDs remain the API identity. PAY formatting is display-only; no persistent business identifier is defined. |
| Read timestamp timezone | C | DTOs use `DateTime`; existing local timestamps lack offsets. Confirm UTC/offset semantics without inventing an offset in frontend. |
| Recipient metadata / Bankgiro / BIC / country / fees | C | Absent from payment DTOs/contracts. The native BIC validator does not supply these values. Agree feature scope and read data. |
| Initial approval steps / creation-to-inbox lifecycle | A | #156 now initializes and persists the first step. The old no-initial-step gap is resolved for newly created payments. |
| Public approval-step identity | A | #155 uses UUIDs in `PendingApprovalDto`, decision DTO/route and `ApprovalRepository`. Numeric payment IDs remain unchanged. |
| Full named approval chain / approver identities and statuses | C | `GET /api/approvals` is an authorized inbox, not arbitrary payment chain/history. No new detail-side chain API. |
| Detail required/remaining approval counts | C | Inbox has `currentStep`, `totalSteps`, `requiresDoubleApproval`; dashboard summaries do not. Do not infer thresholds or copy sample counts. |
| Authorized detail action context | C | Decisions exist at `/api/approvals/{approvalStepId:guid}/decision`; the general detail source provides no eligible UUID/state. Keep actions disabled until an authorized context is available. |
| Signing | C | No payment-signing contract/API; audit hash chaining is not payment signing. |
| Complete payment-specific activity | C | `AuditLogController` only accepts limit/cursor for the tenant feed. Matching the latest 50 entries is not complete payment history. |
| Creation audit | C | `PaymentService` still does not append CREATE_PAYMENT. Existing seeded entries are not proof of runtime creation audit coverage. |
| Creation role authorization | C | `PaymentsController` has `[Authorize]`, not the contract's initiator/admin restriction. |
| Payment API IBAN validation | C | Native validator is delivered (#149), but POST still only checks non-empty IBAN. Backend integration remains unsupported here. |
| Reference validation | C | EF max length is 100; no explicit API length check or matching validation error. |
| Error consistency / foreign account status | C | Controller message objects and exception ProblemDetails remain mixed; repository tenant filtering results in 404 where the payment contract says 403. Agree the security-safe contract. |
| Empty 401 body | B | Previously documented backend follow-up remains: authentication challenges do not implement the contract's ProblemDetails JSON. No newly merged fix found. |
| Planned JSON-number amount migration (#154) | B | Not merged; current payment request contract still says string. Future request/response/precision semantics must be updated together when merged. |
| Current string amount transport | A | String requests match today's contract and pass the current authenticated HTTP pipeline in the existing isolated test factory; response amounts remain strings. |
| Nullable/precision guarantees | C | Optional reference is nullable on backend and normalized in the API layer. Broader required/nullability/precision guarantees remain undefined; #154 may change the agreed representation. |

No source changes are needed for the newly merged GUID/lifecycle/auth work in
the current Betalningar read views. API routing still sends `/api/dashboard`
and `/api/payments` to the real backend through the unchanged shared client.

### Existing local environment boundary

The API must be restarted from the synced code before testing; testing an older
running binary does not verify the merge. #155 also adds
`approval_steps.public_id` in the EF mapping and seed script, but no migration
for an already-created database is supplied. The earlier local setup lacks the
transactions table required by `PaymentRepository.GetAccountAsync`. No schema
change, reseed or persistent payment/approval mutation is authorized in this
frontend check. Use the existing isolated in-memory HTTP test factories to
verify creation without modifying demo data, and distinguish those tests from
a persistent PostgreSQL end-to-end test.

## Verification boundary

Read-only browser checks should cover the real recent list, selected/direct detail
links, empty/error/auth states, unavailable controls, responsive overflow, sidebar
and quick-action navigation, and existing NewPayment/Batchfiler/Audit Log routes.
Do not create payments or approval decisions just to test presentation.

### Local verification, 2026-10-07

Route rendering and unauthenticated states were checked in an isolated browser
at desktop, tablet and 320/390px mobile widths. Payment navigation, the back link,
NewPayment, Batchfiler and Audit Log routes resolved without JavaScript exceptions
or page-level horizontal overflow. Real dashboard requests reached port 5010;
unauthenticated reads returned 401. No payment or approval mutations were sent.

The initial login 500 was resolved by starting the same existing PostgreSQL
instance, without changing database contents or configuration. The real Lisa
session now reads dashboard successfully. List refinement verification used
only the two existing payment records: PAY-00001/PAY-00002 link to numeric routes,
real IBANs and monetary values are retained, and timestamps display as yesterday
in Swedish local time. Status/amount filters produced the expected 0/1/2 rows;
all date options and calendar-day cutoffs were checked. Empty results were not
treated as API errors. Reset restored defaults with no extra API request.

The populated list was compared with Figma at desktop size and checked at
1920/1440/768/390/320px widths. No page-level horizontal overflow or application
console errors were found.

Details refinement was checked against the real responses for payments 1 and 2.
PAY-00001/PAY-00002 remain presentation-only; numeric navigation and audit matching
are unchanged. Each detail rendered its one matching CREATE_PAYMENT event with
the original description, actor and timestamp. Creator and unsupported information
remain unavailable; no chain, approval count or signing functionality was invented.
No payment/approval mutation was sent.

The final-refinement baseline already fit at 1366x768. Overflow was reproduced
at 1366x700 (54px) and 1110x768 (26px): content-sized cards and page spacing
exceeded available height. This was a Details constraint, not a shared-shell bug.
The bounded desktop row now measures 422px at 1366x768, with the 72px action
card fully visible at y=672..744. It measures 354px at 1366x700 and 630px at
1440x1024. The tested normal desktop sizes have no page-level vertical overflow.
At 1920x1080 the row stops at 640px rather than expanding indefinitely.

Removable browser-only layout spacers verified overflow in all three bodies.
PageDown and direct scrolling moved each body while its heading, card bounds
and action card stayed fixed; the page did not grow. The mobile probe expanded
the page normally rather than introducing nested scrolling. Every spacer was
removed and the real payment/activity rendering was rechecked afterward.

Count-only pagination checks verified 2/18/27/53 items produce 1/2/3/6 pages,
including partial last pages, empty results, clamping and large-page windows.
These were calculation tests, not fake records inserted into the application.
Real browser checks used only the two existing payments and verified the single
active page, disabled arrows, harmless current-page clicks and no added requests.
The approved list's IDs, dates, filters, amounts, statuses, footer counts,
numeric links and non-pagination geometry passed regression checks.

### Final post-sync verification

The restarted API from the synced source answered dashboard and audit reads with
HTTP 200 after Lisa logged in through the existing login form in a fresh isolated
temporary browser profile. `/payments`, `/payments/1` and `/payments/2` rendered
the same two existing real payments, exact monetary values, statuses, dates and
matching audit events. Filter/reset, truthful client paging, numeric navigation,
desktop/mobile layouts and Details body scrolling passed. No authenticated
application console errors were found; the initial unauthenticated dashboard
401 was an expected login challenge. No persistent payment or approval request
was sent by the browser. NewPayment loaded the three existing real accounts;
Dashboard, Batchfiler and Audit Log route regressions passed unchanged.

TypeScript no-emit, lint, production build and diff whitespace checks passed.
The existing `PaymentServiceTests`, `PaymentsAuthorizationIntegrationTests` and
`CookieAuthenticationIntegrationTests` passed (45 tests). The existing
`CreatePayment_WhenApprovalIsRequired_AppearsInAttestantsInbox` HTTP test passed
separately and sent no approval/rejection decisions.

An additional temporary harness outside the repository reused the existing
`CookieAuthenticationApiFactory` and its unique EF InMemory database. It posted
JSON captured from the actual frontend `createPayment` serializer, with string
amounts `125.50` and `75000.00`, after cookie login and fresh CSRF acquisition.
Both returned 201 with matching amounts, numeric payment IDs and the expected
completed/pending statuses. Isolated persistence checks verified the small
payment's balance/transaction and the large payment's initial public-GUID step,
without assigning the creator. No persistent demo writes or approval decisions
occurred. This verifies the current request/auth/lifecycle pipeline, not the
existing local PostgreSQL schema or a persistent browser create-payment E2E.
