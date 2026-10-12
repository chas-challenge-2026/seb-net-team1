# Batchfiler frontend readiness

## Routes and isolation

- `/batch-files`: history overview, status selection, search, type and sorting controls.
- `/batch-files/:batchId`: file metadata and validation/error drill-down.
- `/batch-upload`: existing local CSV upload/validation, reset and corrected-file recovery.

No Batch API is called and no successful submission is simulated. Normal mode explicitly
reports unavailable history rather than claiming an empty server dataset. Existing upload
links remain valid. Only the Batch navigation destination/active state and Batch routes change.

## Development verification

Vite development mode only:

- `/batch-files?preview=fixtures`: labelled read-only development records, client pagination.
- `/batch-files?preview=fixtures&pagination=cursor`: labelled local cursor simulation.
- Add `&scenario=slow`, `&scenario=empty` or `&scenario=error` for those states.
- In cursor mode, `&scenario=page-error` exercises a failed Next request without losing the current page.
- `/batch-files/fixture-4?preview=fixtures`: 100 rows, 52 valid and 48 invalid, with exact errors.

Fixture downloads contain the actual synthetic CSV used for that fixture. They are labelled
development examples, not backend downloads. The fixture module is dynamically imported
behind `import.meta.env.DEV`; production cannot enable it with URL parameters.
No json-server changes, database changes, API URLs or new packages are involved.

## Validation preserved

Header: `from_account_id,to_iban,amount,reference`. The parser retains its BOM/trim handling,
quoted/escaped fields, line endings and blank-record handling. Physical record-start line
numbers now survive blank and multiline fields; payment ordinals are separate.

Existing rules remain: `.csv`, at most 1,048,576 bytes, 10–500 data records; positive digit-only
account ID up to 999999999; required whitespace-normalized alphanumeric IBAN up to 34 characters;
finite positive numeric amount; trimmed reference up to 100 characters (empty allowed).
Existing `Number()` amount acceptance, including exponent/hex syntax, is deliberately unchanged.
This is local format validation, not verification of accounts, balances or an IBAN checksum.
No mandatory BIC column was added.

Header/parser errors block row approval and amount summaries. Wrong column counts are
individual row errors. Row-count limits remain file-level errors with trustworthy row review.
Replacement/reset invalidates obsolete asynchronous reads, including errors from old reads.

## Backend handoff: decisions needed

Issue #154 is open; current SebPortal.Api has no Batch upload/history/detail/download endpoints.
Legacy Razor upload is not a JSON Batch API and is not used by React.

The backend team must supply an agreed contract covering:

1. Actual endpoints/methods and upload format (multipart file versus structured rows).
2. Roles, tenant scoping, source-account ownership and cookie/CSRF behavior.
3. File metadata, business file categories and authoritative processing/status values.
4. List/search/filter/sort semantics; complete collection versus cursor pages; counts and totals.
5. Detail validation results, original CSV locations, error codes and HTTP/ProblemDetails shapes.
6. Atomic versus partial processing, balance/approval/audit effects and duplicate-safe retries.
7. Download content, filename, authorization and retention behavior.
8. Confirmed file/row limits, decimal precision and IBAN/MOD97/BIC requirements.

`BatchHistorySource` is a frontend adapter boundary, NOT a proposed HTTP contract. A future
real adapter should use the existing `apiRequest` cookie/CSRF helper. It can map backend DTOs
to the frontend view model without rewriting components. It must forward AbortSignal, retain
opaque backend cursors and never infer totals from a partial page. Client pagination requires
a complete collection. Cursor UI exposes only reached pages and updates navigation on success.

## Checks

From `frontend`:

```bash
npx tsc -p tsconfig.app.json --noEmit --incremental false
npm run lint
npm run build
node --experimental-vm-modules --test tests/batch.test.mjs
```

From the repository root: `git diff --check`.

Browser QA uses an isolated temporary context, never a personal browser profile. Cover real
local file selection/replacement/reset; error drill-down; 100/52/48 summaries; structure blocking;
search/filter/sort/page reset; cursor Previous/Next; error/empty/loading states; keyboard operation;
long filenames and desktop/tablet/mobile layouts. Actual Batch API integration remains a separate
test after the agreed API exists; fixture tests are not evidence of backend integration.
