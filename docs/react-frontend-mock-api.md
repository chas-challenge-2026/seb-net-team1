# React Frontend – Uppstart och Mock API

## Syfte

Frontend byggs i **React 18 med TypeScript**.

För att frontendgruppen ska kunna utveckla och testa frontend innan .NET-backenden är färdig används ett **mockat API**.

Flödet under utvecklingen:

```text
React → Mock API → Mock-data
```

När .NET-backenden är färdig:

```text
React → .NET API → PostgreSQL
```

På detta sätt kan frontend utvecklas oberoende av backend och senare kopplas till de riktiga API-endpointsen.

---

## 1. Skapa frontend-mappen

En separat mapp skapades i projektroten:

```text
frontend/
```

Projektstrukturen blir exempelvis:

```text
seb-net-team1/
├── backend/
├── docs/
├── frontend/
├── infra/
├── native/
└── shared/
```

---

## 2. Skapa React-projekt med TypeScript

Gå in i frontend-mappen:

```bash
cd frontend
```

Skapa React-projektet med Vite och TypeScript:

```bash
npm create vite@latest . -- --template react-ts
```

---

## 3. Använd React 18

Vite installerade initialt React 19.

Eftersom frontend ska använda **React 18** ändrades versionerna:

```bash
npm install react@18.3.1 react-dom@18.3.1
```

---

## 4. Installera TypeScript-typer för React 18

```bash
npm install -D @types/react@18.3.12 @types/react-dom@18.3.1
```

Frontend använder nu:

```text
React 18
React DOM 18
TypeScript
Vite
```

---

# Mock API

## 5. Installera json-server

För att frontend ska kunna utvecklas innan .NET API:t är färdigt används `json-server`.

Installera:

```bash
npm install -D json-server
```

---

## 6. Skapa mock-data

I frontend skapades:

```text
frontend/
└── mock/
    └── db.json
```

`db.json` innehåller testdata som motsvarar datan i den befintliga backend-lösningen.

Mock-datan innehåller:

```text
users
tenants
accounts
payments
approvalSteps
```

Exempel:

```json
{
  "users": [
    {
      "id": 1,
      "tenantId": 1,
      "name": "Lisa Persson",
      "email": "lisa@malmobygg.se",
      "role": "initiator"
    }
  ],

  "tenants": [
    {
      "id": 1,
      "name": "Malmö Bygg AB"
    }
  ],

  "accounts": [
    {
      "id": 1,
      "tenantId": 1,
      "accountName": "Driftkonto",
      "iban": "SE4550000000058398257466",
      "balance": 2500000,
      "currency": "SEK"
    }
  ]
}
```

---

## 7. Lägg till kommando för Mock API

I `frontend/package.json` lades följande script till:

```json
"scripts": {
  "dev": "vite",
  "mock": "json-server --watch mock/db.json --port 3001",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

---

## 8. Starta Mock API

Mock-servern startas från `frontend`:

```bash
npm run mock
```

Servern körs på:

```text
http://localhost:3001
```

---

## 9. Tillgängliga endpoints

Mock-servern skapar automatiskt API-endpoints från `db.json`.

```text
GET /users
GET /tenants
GET /accounts
GET /payments
GET /approvalSteps
```

Exempel:

```text
GET http://localhost:3001/accounts
```

returnerar konton från mock-datan.

---

# Tanken framåt

React ska anropa mock-API:t på samma sätt som frontend senare kommer anropa .NET API:t.

Under utveckling:

```text
React
   ↓
HTTP request
   ↓
Mock API (json-server)
   ↓
db.json
```

När backend är färdig:

```text
React
   ↓
HTTP request
   ↓
.NET API
   ↓
PostgreSQL
```

Det gör att frontend kan utvecklas och testas redan nu utan att behöva vänta på att backendgruppen färdigställer API:t.