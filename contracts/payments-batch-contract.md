## Payments

### POST `/api/payments/batch`

Processes an input CSV file containing multiple payments. Payments are only created when the file is properly parsed and every row is valid (IBAN, amount, source account and balance). The batch is all-or-nothing: if any row is invalid, no payment is created.

Endpoint follows the standard payment creation rules, payments above the approval threshold are stopped to be manually reviewed.

Requires authentication (browser cookie and `X-CSRF-TOKEN` header, see [Browser authentication](API.md#browser-authentication)) and role `initiator` or `admin`.

---

## Request

The request body is the CSV text itself. It is not a form upload and has no field name.

| | |
|---|---|
| Method / path | `POST /api/payments/batch` |
| `Content-Type` | `text/csv` |
| Header row | `from_account_id,to_iban,amount,reference`, required and exact |
| Max size | 1 MiB |
| Currency | always `SEK` |

### Request Example
`Content-Type: text/csv`
```
from_account_id,to_iban,amount,reference
1,SE3550000000054910000003,5000.00,Faktura #2001
1,SE7850000000054910000005,75000.00,Faktura #2002
1,SE5150000000054910000006,8750.50,Faktura #2003
```

### Validation

Every row is checked and every problem is reported in one response. Row numbers count the header as row 1, so the first payment is row 2.

| Check | Rule |
|---|---|
| IBAN | Spaces are removed and letters upper-cased before checking. Length per country, characters and MOD97 checksum must be valid. |
| Amount | Greater than 0 and at most `9999999999999.99`. Rounded to 2 decimals. |
| Source account | `from_account_id` must be an account in the logged-in user's tenant. An account that does not exist and one that belongs to another tenant give the same error. |
| Balance | Payments that complete immediately are checked against the account balance in file order. Payments that need approval do not use balance until approved. |

---

## Success Response

### `201 Created`

```json
{
  "processed": true,
  "parsed": true,
  "total": 3,
  "completed": 2,
  "pendingApproval": 1,
  "totalAmount": 88750.50,
  "payments": [
    {
      "id": 101,
      "status": "completed",
      "fromAccountId": 1,
      "toIban": "SE3550000000054910000003",
      "amount": 5000.00,
      "currency": "SEK",
      "reference": "Faktura #2001",
      "createdAt": "2026-09-02T10:30:00Z"
    },
    {
      "id": 102,
      "status": "pending_approval",
      "fromAccountId": 1,
      "toIban": "SE7850000000054910000005",
      "amount": 75000.00,
      "currency": "SEK",
      "reference": "Faktura #2002",
      "createdAt": "2026-09-02T10:30:00Z"
    },
    {
      "id": 103,
      "status": "completed",
      "fromAccountId": 1,
      "toIban": "SE5150000000054910000006",
      "amount": 8750.50,
      "currency": "SEK",
      "reference": "Faktura #2003",
      "createdAt": "2026-09-02T10:30:00Z"
    }
  ]
}
```

The example matches the request example above: three rows, one of them above the approval threshold.

### Response fields

| Field | Type | Description |
|---|---|---|
| `processed` | boolean | Were any payments created by this request? |
| `parsed` | boolean | Could the CSV data be parsed by the backend? |
| `total` | number | Number of payments created |
| `completed` | number | Number of payments that were instantly completed |
| `pendingApproval` | number | Number of payments that exceeded the approval threshold and wait for an attestant |
| `totalAmount` | number | Sum of the amounts of every payment created (completed + pending). |
| `payments` | array | List of every payment created, in file order |

### Payment data
Follows the format of the usual payment API.

| Field | Type | Description |
|---|---|---|
| `id` | number | Newly created payment's id |
| `status` | string | `completed` if under the approval threshold, otherwise `pending_approval` |
| `fromAccountId` | number | Account the payment was made from |
| `toIban` | string | Recipient IBAN, no spaces |
| `amount` | number | Payment amount |
| `currency` | string | Currently always `SEK` for MVP |
| `reference` | string | Payment reference |
| `createdAt` | string (ISO 8601) | When the payment was created |

---

## Error Responses

### `400 Bad Request` (case 1)

Returned when the backend failed to parse the CSV data, containing no row information.

```json
{
  "processed": false,
  "parsed": false,
  "message": "Header does not match expected format."
}
```

`message` is a user-facing error message. When `parsed` is `false` there is no `rows` list, and the frontend should only show `message`.

| `message` | Cause |
|---|---|
| `Ingen fil vald.` | The body is empty |
| `Filen är för stor.` | The body is larger than 1 MiB |
| `Header does not match expected format.` | The header row is missing or is not exactly `from_account_id,to_iban,amount,reference` (text from the native parser, in English) |
| `CSV contained no rows` | The file has a header but no payments (native parser, English) |
| `Filen innehåller inga betalningar.` | No payment rows were found |
| other text from the native parser | A row is malformed, for example the wrong number of fields |

### `400 Bad Request` (case 2)

Returned when the backend found invalid payments, aborting payment creation and showing which are invalid.

```json
{
  "processed": false,
  "parsed": true,
  "message": "2 av 3 rader är ogiltiga. Inga betalningar skapades.",
  "totalRows": 3,
  "invalidRows": 2,
  "rows": [
    {
      "rowNumber": 2,
      "content": "1,SE8550000000054910000003,0,Tva fel",
      "error": "IBAN:ens kontrollsiffror är ogiltiga. Beloppet måste vara större än 0."
    },
    {
      "rowNumber": 4,
      "content": "999999,SE7850000000054910000005,100,Saknat konto",
      "error": "Kontot hittades inte."
    }
  ]
}
```

Only the invalid rows are listed. A row with several problems has them joined into one `error` string. `content` is the row rebuilt from the parsed fields, not the original line, so spacing and quoting can differ and the amount is shown as parsed (`500`, not `500.00`).

| `error` text | Cause |
|---|---|
| `IBAN måste anges.` | IBAN is empty |
| `IBAN har fel längd för landet.` | Length does not match the country |
| `IBAN har en okänd landskod.` | Unknown country code |
| `IBAN innehåller ogiltiga tecken.` | Invalid characters |
| `IBAN:ens kontrollsiffror är ogiltiga.` | MOD97 checksum fails |
| `Beloppet är inte ett giltigt belopp.` | The amount can not be represented as a number |
| `Beloppet måste vara större än 0.` | Amount is 0 or less |
| `Beloppet är för stort.` | Amount is above `9999999999999.99` |
| `Avsändarkonto måste anges.` | `from_account_id` is 0 or less |
| `Kontot hittades inte.` | The account does not exist or belongs to another tenant |
| `Kontot har inte tillräckligt saldo.` | Earlier rows in the file already use the balance |

### Other errors

These responses do not contain `processed` or `parsed`. Check the HTTP status first, and only treat the body as a batch result when it contains `processed`. Nothing is created in any of them.

### `401 Unauthorized`

Returned when the JWT is missing, invalid, or expired. See [Browser authentication](API.md#browser-authentication).

### `403 Forbidden`

Returned when the logged-in user's role is not `initiator` or `admin`.

An account that is missing or belongs to another tenant is **not** a `403` here. It is reported per row in the `400` response above, as `Kontot hittades inte.`

### `409 Conflict`

Returned when a source account was changed by another payment while the batch was being saved. The whole batch is rolled back and nothing is created. The user can try again.

```json
{
  "status": 409,
  "title": "Conflict",
  "detail": "Kontot ändrades av en annan betalning. Uppdatera och försök igen."
}
```

---

## Drawbacks
- Batch files are currently processed immediately and do not have an asynchronous "Processing" state as seen in the frontend.
- Native CSV module is currently not verbose enough to inform what row in CSV data is invalid on parse error.

---

## Important

This contract is a first version and can be changed if frontend or backend needs adjustments.
If the request or response format changes, this document should be updated so the whole team stays aligned.
