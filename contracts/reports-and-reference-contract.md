## Reports, configuration and validation

All endpoints require a valid JWT (any role).

### GET `/api/reports/summary?months=6`

Payment statistics for the last `months` calendar months, including the current one (1–24, default 6).

```json
{
  "months": [
    { "month": "2026-04", "completedCount": 4, "completedAmount": "61200.00", "pendingCount": 0,
      "pendingAmount": "0.00", "rejectedCount": 1, "rejectedAmount": "12000.00" }
  ],
  "byStatus": [
    { "status": "completed", "count": 18, "amount": "412000.00" },
    { "status": "pending_approval", "count": 4, "amount": "510500.00" },
    { "status": "rejected", "count": 2, "amount": "182000.00" }
  ],
  "topRecipients": [
    { "toIban": "SE3550000000054910000003", "count": 5, "amount": "87000.00" }
  ]
}
```

- `months` is oldest first and always has exactly `months` entries (months without payments are zeros). Payments are counted in the month they were created.
- `topRecipients`: the five recipients with the highest completed amount in the period.

### GET `/api/config`

The business rules the frontend displays but must never hardcode:

```json
{
  "approvalThreshold": "50000.00",
  "doubleApprovalThreshold": "200000.00",
  "currency": "SEK",
  "maxBatchFileSizeBytes": 1048576,
  "maxBatchRows": 1000
}
```

### GET `/api/validation/iban?value=...`

The same IBAN check payment creation uses (MOD97 and per-country length), for instant feedback in forms.

```json
{
  "valid": true,
  "normalized": "SE4550000000058398257466",
  "formatted": "SE45 5000 0000 0583 9825 7466",
  "countryCode": "SE",
  "errorCode": 0,
  "message": "Giltigt IBAN."
}
```

| `errorCode` | Meaning |
|---|---|
| 0 | Valid |
| 1 | Wrong length (for the country, or outside 15–34 characters) |
| 2 | Unknown country code |
| 3 | Invalid character |
| 4 | Wrong check digits (MOD97) |

The codes match the native `libiban` module (`validate_iban`).

### GET `/health`

Anonymous. For monitoring:

```json
{
  "status": "Healthy",
  "checks": [
    { "name": "database", "status": "Healthy", "description": null },
    { "name": "audit_chain", "status": "Healthy", "description": "57 audit entries verified." }
  ]
}
```

`503` with `"status": "Unhealthy"` when the database is unreachable or an audit chain is broken.
