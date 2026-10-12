# Payment reports contract

## GET /api/reports/payments

All authenticated roles, including `attestant`, may read this endpoint. The user
must still exist in the tenant identified by their signed token. The API uses
only token claims for the user and tenant; query parameters cannot select another
tenant. Missing or invalid authentication, missing identity claims, and a user
that no longer belongs to the claimed tenant return `401`.

Both `from` and `to` are required strict calendar dates in `YYYY-MM-DD` format:

```http
GET /api/reports/payments?from=2026-10-01&to=2026-10-08
```

The dates are inclusive calendar days in `Europe/Stockholm`, independently of
browser, API host, and database session time zones. The API converts the start
midnight and the midnight after `to` separately to UTC, then selects
`created_at >= startUtc AND created_at < endUtc`. A same-day period is valid.
Daylight saving transitions therefore include a 23-hour or 25-hour day as
appropriate. The existing PostgreSQL `TIMESTAMP WITHOUT TIME ZONE` column stores
UTC clock values; report parameters use that same database type and output
restores the known UTC kind without shifting the clock value.

Missing dates, invalid dates or formats, and `from > to` return `400` with a
standard `application/problem+json` body and a safe Swedish `detail` message.

```json
{
  "from": "2026-10-01",
  "to": "2026-10-08",
  "timeZone": "Europe/Stockholm",
  "payments": [
    {
      "id": 42,
      "reference": "Faktura 42",
      "toIban": "SE4550000000054910000099",
      "fromAccountName": "Företagskonto",
      "amount": "1250.50",
      "currency": "SEK",
      "status": "completed",
      "createdAt": "2026-10-08T14:30:00Z"
    }
  ]
}
```

Every payment in the period is returned, including every status. There is no
dashboard row limit or pagination. The order is newest `createdAt` first, then
highest `id` first when timestamps match. An empty period returns `payments: []`.

`amount` is always an invariant decimal string with exactly two fractional
digits. `reference` is always a string, empty when no reference was stored.
`fromAccountName` is a string or `null` if the source account is unavailable or
does not belong to the same tenant. `createdAt` is an ISO 8601 UTC timestamp with
a trailing `Z`. The report performs only queries and does not modify payments,
balances, approval steps, transactions, or audit entries.

Timestamp parameter behavior follows [Npgsql's date and time documentation](https://www.npgsql.org/doc/types/datetime.html).
Explicit provider parameters are composed through [EF Core's parameterized SQL query API](https://learn.microsoft.com/en-us/ef/core/querying/sql-queries).
