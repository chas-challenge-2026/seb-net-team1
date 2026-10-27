## Accounts

The logged-in user's company accounts, their balances and transaction history. All endpoints require a valid JWT (any role) and only return the caller's tenant.

### Account

```json
{
  "id": 1,
  "accountName": "Driftkonto",
  "iban": "SE4550000000058398257466",
  "balance": "2485000.00",
  "availableBalance": "2160000.00",
  "reservedAmount": "325000.00",
  "currency": "SEK",
  "pendingPaymentCount": 2
}
```

| Field | Type | Description |
|---|---|---|
| `balance` | string | Booked balance. Money leaves it only when a payment is completed |
| `reservedAmount` | string | Sum of the account's payments waiting for attest |
| `availableBalance` | string | `balance - reservedAmount`: what new payments may use |
| `pendingPaymentCount` | number | How many of the account's payments wait for attest |

### GET `/api/accounts`

`200 OK` with an array of accounts, ordered by id.

### GET `/api/accounts/{id}`

`200 OK` with one account. `404` (`Kontot hittades inte.`) when it does not exist in the caller's tenant.

### GET `/api/accounts/{id}/transactions?page=1&pageSize=20`

The account's booked transactions, newest first, as a paged list (`pageSize` max 100):

```json
{
  "items": [
    { "id": 88, "date": "2026-09-29T13:19:00Z", "amount": "-6990.00", "description": "IT-support september",
      "transactionType": "payment", "paymentId": 29 },
    { "id": 80, "date": "2026-09-01T07:00:00Z", "amount": "185000.00", "description": "Kundinbetalningar",
      "transactionType": "deposit", "paymentId": null }
  ],
  "totalCount": 21,
  "page": 1,
  "pageSize": 20
}
```

| Field | Type | Description |
|---|---|---|
| `amount` | string | Negative for money leaving the account |
| `transactionType` | string | `payment` or `deposit` |
| `paymentId` | number \| null | The payment that caused the transaction |

`404` when the account does not exist in the caller's tenant.

---

## Backend Notes

- A transaction is written in the same database transaction as the payment completion that caused it (US-24), so balance and history cannot drift apart (v1 never drew the balance for direct payments, BUG-009).
- Accounts carry an optimistic concurrency token (PostgreSQL `xmin`), so two payments that read the same balance cannot both write it.
