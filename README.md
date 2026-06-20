# SEB Företagsbetalningar

Ett betalningsportal-system för SEB:s SME-kunder. Initiator skapar betalningar, attestanter godkänner, allt loggas i en granskningslogg.

**Detta är v1 — ett avsiktligt spaghetti-system. Er uppgift är att bygga v2.**

---

## Snabbstart

```bash
git clone <repo-url>
cd ChasChallenge
git checkout 3-seb

cd infra
docker compose up --build
```

Öppna [http://localhost:8081](http://localhost:8081)

| Roll | E-post | Lösenord |
|------|--------|---------|
| Initiator | lisa@malmobygg.se | password123 |
| Attestant | johan@malmobygg.se | password123 |
| Admin | sara@malmobygg.se | password123 |

---

## Mappstruktur

```
ChasChallenge/
├── backend/
│   └── SebPortal/        — ASP.NET Core 8 Razor Pages
│       ├── Pages/        — En PageModel per sida, all logik här
│       ├── wwwroot/      — Statiska filer
│       ├── Dockerfile
│       ├── Program.cs
│       └── appsettings.json
├── docs/
│   ├── architecture.md   — Hur v1 är byggd
│   ├── known-bugs.md     — Lista med 12 kända buggar (avsiktliga)
│   ├── README-pain-points.md — Vad som fungerar vs. går sönder
│   └── v2-targets.md     — Vad ni ska bygga
├── frontend/             — Tom — er v2 React-app placeras här
├── infra/
│   ├── docker-compose.yml
│   └── seed.sql          — Schema + testdata
├── native/
│   └── README.md         — Spec för C/C++ native moduler (v2)
└── shared/
    └── example-batch.csv — Exempelfil för batchuppladdning
```

---

## Kända problem

Se [docs/known-bugs.md](docs/known-bugs.md) för fullständig lista. De allvarligaste:

- **SQL-injektion** i inloggningsformuläret (BUG-001)
- **MD5-lösenord** — trivialt att knäcka (BUG-002)
- **IBAN-validering** kontrollerar inte kontrollsiffror (BUG-003)
- **CSV-parser** bryter på kommatecken i fält (BUG-004)
- **Attesttröskel** definierad med olika värden i två filer (BUG-006)
- **Notifieringar** misslyckas tyst, ingen retry (BUG-007)
- **Dubbel audit-logg** — DB + fil, inkonsekvent (BUG-008)

---

## Vad ska ni bygga

Se [docs/v2-targets.md](docs/v2-targets.md) för fullständiga krav.

Kortversion:
- .NET 8 **Web API** (ersätter Razor Pages)
- **React 18** frontend
- **Entity Framework Core 8** (ersätter raw ADO.NET)
- Proper **autentisering** (JWT, Bcrypt)
- **Notifieringskö** med retry
- **IBAN MOD97**-validering
- C/C++ **native moduler** (CSV, IBAN, audit-signering)

---

## Teknisk stack (v1)

- ASP.NET Core 8 Razor Pages
- Npgsql (ADO.NET)
- PostgreSQL 12
- Docker Compose
- Bootstrap 5 (CDN)
