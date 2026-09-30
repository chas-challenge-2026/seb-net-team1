# SEB Företagsbetalningar

Ett betalningsportal-system för SEB:s SME-kunder. Initiator skapar betalningar, attestanter godkänner, allt loggas i en granskningslogg.

**Detta är v1 — ett avsiktligt spaghetti-system. Er uppgift är att bygga v2.**

---

## Snabbstart

```bash
git clone <repo-url>
cd ChasChallenge
git checkout 3-seb
```

**Första gången:** skapa JWT-nyckeln enligt [JWT-nyckel för Docker](#jwt-nyckel-för-docker) nedan.
Starta sedan Docker Desktop och kör från projektets rot:

```bash
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

## JWT-nyckel för Docker

Jag har kopplat JWT till Docker och testat att API:t accepterar giltiga token
och nekar åtkomst utan token. För att köra på era datorer behöver ni skapa en
egen signeringsnyckel. Själva JWT-token får ni automatiskt när ni loggar in.

### 1. Skapa och spara er nyckel

Öppna **PowerShell i projektets rot**, där `README.md` ligger, och kör hela
blocket **en gång**. Det skapar en slumpmässig nyckel och sparar den som
`JWT_KEY` i `infra/.env`. Finns filen redan behålls den.

```powershell
if (Test-Path -LiteralPath infra/.env) {
    Write-Host 'infra/.env finns redan. Gå vidare till steg 2.'
} else {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $jwtKey = [Convert]::ToBase64String($bytes)
    Set-Content -LiteralPath infra/.env -Value "JWT_KEY=$jwtKey" -Encoding ASCII
}
```

Filen ligger utanför Git och Docker-imagen men innehåller nyckeln i klartext
på datorn. Behåll samma nyckel mellan starter. User Secrets behövs inte för Docker.

### 2. Starta Docker

Starta Docker Desktop. Kör sedan från projektets rot:

```powershell
cd infra
docker compose up --build
```

Compose skickar nyckeln till backend som `Jwt__Key`. Kommandot bygger även om
en befintlig app. Databasen behöver vara konfigurerad för nuvarande API och ha
ett fungerande testkonto för att inloggningen ska fungera.

### 3. Logga in

Öppna [http://localhost:8081](http://localhost:8081) och logga in med ert testkonto.
Tryck **Ctrl+F5** om ni hade sidan öppen före ombyggnaden. Inloggningen använder
Docker-backend på samma adress; ni behöver inte starta `dotnet run` eller `npm run dev`.

### 4. Kontrollera att JWT fungerar

Efter inloggningen: öppna webbläsarens utvecklarverktyg med **F12**, välj
**Console** och kör följande. Det gör två läsanrop till API:t och visar bara
statuskoderna, inte själva token.

```javascript
fetch('/api/dashboard', {
  headers: {
    Authorization: 'Bearer ' + localStorage.getItem('accessToken')
  }
}).then(r => console.log('Med token:', r.status));

fetch('/api/dashboard')
  .then(r => console.log('Utan token:', r.status));
```

**Med token: 200** betyder att token accepteras. **Utan token: 401** betyder
att API:t nekar åtkomst, precis som det ska. Den röda 401-raden är förväntad.
Dashboardens befintliga anrop till mockservern på port `3001` är en separat koppling.

Detta gäller lokal Docker-körning. I stage/prod måste driftmiljön tillhandahålla `JWT_KEY`.

---

## JWT-nyckel för lokal körning utan Docker

Du behöver .NET 8 SDK. Kör kommandona i **samma PowerShell-terminal från
projektets rot**, där `README.md` ligger. User Secrets är redan aktiverat i projektet.

### 1. Skapa en slumpmässig nyckel

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$jwtKey = [Convert]::ToBase64String($bytes)
```

### 2. Spara nyckeln i User Secrets

```powershell
@{ 'Jwt:Key' = $jwtKey } |
    ConvertTo-Json |
    dotnet user-secrets set --project backend/SebPortal.Api
```

Varje utvecklare gör steg 1–2 en gång på sin dator. Nyckeln sparas utanför
projektet och Git. User Secrets är okrypterad lagring för lokal utveckling.
Behåll nyckeln mellan starter; byter du den slutar gamla token fungera efter omstart.
Frontend får bara JWT-token vid inloggning, aldrig själva signeringsnyckeln.

### 3. Starta om backend

Stoppa backend med **Ctrl+C** om den körs. Starta sedan från projektets rot:

```powershell
dotnet run --project backend/SebPortal.Api --launch-profile http
```

Profilen använder `Development`, där User Secrets läses in automatiskt.
För Docker används i stället [JWT-nyckel för Docker](#jwt-nyckel-för-docker).

### 4. Testa inloggningen

Med databasen igång och konfigurerad: öppna [Swagger](http://localhost:5010/swagger),
välj **POST `/api/Auth/login`**, tryck **Try it out**, fyll i ett testkontos mejl
och lösenord och tryck **Execute**. **200 OK** och ett `accessToken` visar att
inloggningen och skapandet av token fungerar.

---

## Mappstruktur

```
ChasChallenge/
├── backend/
│   └── SebPortal/        — ASP.NET Core 6 Razor Pages
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

- ASP.NET Core 6 Razor Pages
- Npgsql (ADO.NET)
- PostgreSQL 12
- Docker Compose
- Bootstrap 5 (CDN)
