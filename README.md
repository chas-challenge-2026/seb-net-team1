# SEB Företagsbetalningar

En betalningsportal för SEB:s SME-kunder. Initiatorer skapar betalningar (en och en eller som CSV-batch), attestanter godkänner dem, och allt loggas i en manipuleringssäker granskningslogg.

Det här är **v2**: ett .NET 8 Web API och en React 18-frontend som ersätter v1:s Razor Pages-monolit (`backend/SebPortal`, kvar som referens). Se [docs/v2-targets.md](docs/v2-targets.md) för kraven och [docs/known-bugs.md](docs/known-bugs.md) för v1:s buggar.

---

## Snabbstart

Kräver Docker Desktop, .NET 8 SDK och Node 20+.

```powershell
./start-local.ps1            # PostgreSQL + Mailpit i Docker, API med dotnet run, Vite på http://localhost:3000
./start-local.ps1 -ResetDb   # samma, men med en helt ny databas (demodatan skapas igen)
./start-local.ps1 -Docker    # samma image som stage/prod, på http://localhost:8081
```

Ctrl+C stoppar allt. Utan skriptet: `cd infra && docker compose up --build` ger samma sak som `-Docker`.

| Adress | Vad |
|---|---|
| http://localhost:3000 | Portalen (utvecklingsläge, Vite) |
| http://localhost:5010/swagger | API-dokumentation (utvecklingsläge) |
| http://localhost:8025 | Mailpit: e-postnotifieringar som portalen skickar lokalt |
| http://localhost:8081 | Portalen i Docker-läge |

Demoanvändare (lösenord `password123`, företaget Malmö Bygg AB med sex månaders betalningshistorik):

| Roll | E-post | Kan |
|---|---|---|
| Initiator | lisa@malmobygg.se | Skapa betalningar och batcher |
| Attestant | johan@malmobygg.se | Attestera (har väntande betalningar i attestkorgen) |
| Attestant | erik@malmobygg.se | Attestera (steg 2 av en dubbelattest väntar) |
| Admin | sara@malmobygg.se | Allt ovan plus användare och verifiering av loggkedjan |

> Har du en lokal databas från v1 (seed.sql, PostgreSQL 12)? Kör `./start-local.ps1 -ResetDb` en gång.

---

## Funktioner

- **Betalningar**: direkt genomförda upp till 50 000 kr, annars attest, över 200 000 kr dubbel attest av två olika personer. Tillgängligt saldo tar hänsyn till reserverade belopp. Idempotency-Key skyddar mot dubbla betalningar vid omförsök.
- **Batchuppladdning**: RFC 4180-CSV (citerade fält, kommatecken i referenser, tomrader), förhandsgranskning rad för rad, allt-eller-inget i en transaktion. Max 1 MB och 1000 rader.
- **Attestkorg**: fyra ögon-principen (ingen attesterar sin egen betalning eller två steg av samma betalning), kommentarer, historik.
- **Konton och transaktioner**, **betalningshistorik** med filter, sök och **CSV-export** för Excel, **rapporter** per månad.
- **Granskningslogg** i databasen (en enda källa) med HMAC-SHA256-kedja och verifiering som hittar första manipulerade posten.
- **Notifieringar** i appen och via e-post: bakgrundskö (`Channel<T>` + `IHostedService`), MailKit, tre försök med exponentiell backoff, utfallet sparas i databasen.
- **Autentisering**: JWT (15 min) + roterande refresh token i httpOnly-cookie med återanvändningsdetektering, BCrypt, rollstyrning med `[Authorize(Roles = ...)]`, rate limiting på inloggning.
- **Administration**: användare, roller, aktivering och lösenordsåterställning.

---

## Mappstruktur

```
├── backend/
│   ├── SebPortal.Api/        — v2: ASP.NET Core 8 Web API
│   │   ├── Controllers/      — tunna controllers, bara HTTP
│   │   ├── Services/         — affärsregler (betalningar, attest, användare, rapporter ...)
│   │   ├── Repositories/     — dataåtkomst med EF Core
│   │   ├── Data/             — DbContext, migrationer, demodata
│   │   ├── Auditing/         — HMAC-kedjan för granskningsloggen
│   │   ├── Notifications/    — kö, bakgrundsarbetare och MailKit
│   │   ├── Batch/            — CSV-parser och batchbetalningar
│   │   ├── Validation/       — IBAN MOD97 och BIC
│   │   └── Native/           — P/Invoke mot native/-modulerna (med managed fallback)
│   ├── SebPortal.Api.Tests/  — xUnit: enhets- och integrationstester
│   └── SebPortal/            — v1 (Razor Pages), kvar som referens
├── contracts/                — API-kontrakt per område, börja i API.md
├── docs/                     — v1-arkitektur, kända buggar, v2-mål
├── frontend/                 — React 18 + TypeScript + Vite, se frontend/README.md
├── infra/                    — docker-compose (plattformsfil) och lokal override
├── native/                   — C-moduler: libcsvparser (och libiban)
├── shared/                   — exempel-CSV för batchuppladdning
└── start-local.ps1           — startar hela stacken lokalt
```

---

## Utveckling

```bash
dotnet test                                    # alla backend-tester (från repo-roten)
dotnet tool restore                            # installerar dotnet-ef lokalt
dotnet tool run dotnet-ef migrations add Namn --project backend/SebPortal.Api --output-dir Data/Migrations
```

- Databasschemat ägs av EF Core-migrationerna i `backend/SebPortal.Api/Data/Migrations` och körs när API:t startar. Ändra modellen, lägg till en migration, klart.
- Samtidighetstesterna mot riktig PostgreSQL körs när `SEB_TEST_POSTGRES` är satt, t.ex. mot den lokala databasen: `SEB_TEST_POSTGRES="Host=localhost;Port=5433;Username=seb;Password=seb123;Database=postgres" dotnet test`. I CI körs de alltid.
- Frontend: se [frontend/README.md](frontend/README.md). Native-modulerna: `cd native && make test`.
- CI (`.github/workflows/ci.yml`) kör backendtesterna mot PostgreSQL, frontendens lint och bygge samt C-testerna på varje pull request.

Drift och deploy: se [DRIFT.md](DRIFT.md).

---

## Kända v1-buggar och hur v2 löser dem

| Bugg | Lösning i v2 |
|---|---|
| BUG-001 SQL-injektion i inloggningen | EF Core-frågor med parametrar, inga strängbyggda SQL-satser |
| BUG-002 MD5-lösenord | BCrypt (`PasswordHasher`), test på `UserService.CreateUserAsync` |
| BUG-003 IBAN utan kontrollsiffror | MOD97 + längd per land (`IbanValidator`, native `libiban` när den finns), 77 kända IBAN:er i testerna |
| BUG-004 CSV bryter på kommatecken | RFC 4180-parser (native `libcsvparser` i Docker, managed annars) |
| BUG-005 Batch utan transaktion | Allt-eller-inget i en databastransaktion |
| BUG-006 Olika attesttrösklar | En källa: `PaymentRules` i konfigurationen, även frontend läser den via `/api/config` |
| BUG-007 Notifieringar sväljs | Kö + MailKit + tre försök, felet sparas i `notifications` och loggas |
| BUG-008 Dubbel audit-logg | Endast databasen, alla händelser, HMAC-kedja |
| BUG-009 Saldot dras inte vid direktbetalning | Saldo, status och transaktion sparas tillsammans, optimistisk låsning (`xmin`) |
| BUG-010 Hårdkodad anslutningssträng | Endast konfiguration/miljövariabler |
| BUG-011 IDOR i attestkorgen | Steget måste vara tilldelat den inloggade (eller admin i samma tenant) |
| BUG-012 Ingen filstorleksgräns | 1 MB och 1000 rader, kontrolleras innan filen tolkas |

---

## Teknisk stack

- **Backend**: ASP.NET Core 8 Web API, EF Core 8 + Npgsql, PostgreSQL 16, JWT Bearer, BCrypt.Net, MailKit, Serilog, Swagger, health checks, rate limiting
- **Frontend**: React 18, TypeScript, Vite, TanStack Router, TanStack Query, Zod
- **Native**: C (gcc, OpenMP), anropas med P/Invoke
- **Drift**: Docker (flerstegsbygge: frontend, native, backend, runtime), Docker Compose
