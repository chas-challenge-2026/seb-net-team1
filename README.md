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

**Första gången:** skapa [JWT-nyckeln](#jwt-nyckel-för-docker) och fyll i
[databasuppgifterna](#databasuppgifter) i `infra/.env` enligt instruktionerna nedan.
Skapa även ett [lokalt testlösenord](#lokala-testkonton) om ni vill använda testkontona.
Starta sedan Docker Desktop och kör från projektets rot:

```bash
cd infra
docker compose up --build
```

Öppna [http://localhost:8081](http://localhost:8081)

| Roll | E-post |
|------|--------|
| Initiator | lisa@malmobygg.se |
| Attestant | johan@malmobygg.se |
| Admin | sara@malmobygg.se |

Lösenordet för dessa konton väljer ni lokalt enligt nästa avsnitt.

---

## Lokala testkonton

Jag har tagit bort det gemensamma testlösenordet från README och seed-data.
Varje utvecklare använder i stället ett eget lokalt lösenord för de tre kontona ovan.
Nya seedade konton saknar ett användbart lösenord tills ni konfigurerar detta.

**1. Skapa lösenordet.** När `infra/.env` finns, kör hela blocket i PowerShell
från projektets rot. Befintliga inställningar och testlösenord behålls.

```powershell
if (-not (Test-Path -LiteralPath infra/.env)) {
    throw 'Skapa infra/.env med JWT-nyckel och databasuppgifter först.'
} elseif (Select-String -LiteralPath infra/.env -Pattern '^SEED_TEST_PASSWORD=.' -Quiet) {
    Write-Host 'Ett lokalt testlösenord finns redan.'
} elseif (Select-String -LiteralPath infra/.env -Pattern '^SEED_TEST_PASSWORD=' -Quiet) {
    throw 'Fyll i den befintliga SEED_TEST_PASSWORD-raden innan ni fortsätter.'
} else {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $testPassword = [Convert]::ToBase64String($bytes)
    Add-Content -LiteralPath infra/.env -Value "`nSEED_TEST_PASSWORD=$testPassword" -Encoding ASCII
}
```

Lösenordet finns nu på raden `SEED_TEST_PASSWORD` i er lokala `.env`-fil,
som är undantagen från Git. Det är ett separat lösenord från databasens lösenord
och JWT-nyckeln. Egna testlösenord behöver vara 16–72 byte långa.

**2. Aktivera testkontona.** Kör från projektets rot:

```powershell
cd infra
docker compose up -d --build app
docker compose exec -T db bash /docker-entrypoint-initdb.d/zz-set-test-passwords.sh
```

Det sista kommandot fungerar även med en befintlig databas: det ändrar bara
lösenorden för de tre seedade kontona och sparar separata BCrypt-hashar.
Andra konton och betalningsdata behålls. Databasen behöver inte tömmas.
Vid första starten av en tom lokal databas körs samma script automatiskt.

**3. Logga in.** Öppna [http://localhost:8081](http://localhost:8081) och använd
en av mejladresserna ovan med lösenordet från er `SEED_TEST_PASSWORD`-rad.

Lösenordsinställningen och scriptet kopplas in via den lokala Compose-override-filen.
Grundfilen för stage/prod aktiverar inte testlösenorden. Befintliga databaser får
inte sina gamla testlösenord ändrade automatiskt; de måste hanteras separat.

---

## JWT-nyckel för Docker

Jag har kopplat JWT till Docker och testat att API:t accepterar giltiga token
och nekar åtkomst utan token. För att köra på era datorer behöver ni skapa en
egen signeringsnyckel. Vid inloggning sparar backend JWT i en **HttpOnly-cookie**.
Webbläsaren skickar den automatiskt till API:t; JavaScript kan inte läsa den.

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
För ett planerat byte, följ [nyckelrotation](docs/jwt-key-rotation.md). Då används
`JWT_PREVIOUS_KEY` tillfälligt så att redan utfärdade token fortsätter fungera.
Lägg även in [databasuppgifterna](#databasuppgifter) i samma fil innan ni startar Docker.

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
fetch('/api/dashboard', { credentials: 'include' })
  .then(r => console.log('Med cookie:', r.status));

fetch('/api/dashboard', { credentials: 'omit' })
  .then(r => console.log('Utan cookie:', r.status));
```

**Med cookie: 200** betyder att token accepteras. **Utan cookie: 401** betyder
att API:t nekar åtkomst, precis som det ska. Den röda 401-raden är förväntad.
Tryck sedan **Logga ut** och kör anropet med cookie igen: nu ska även det ge **401**.
Gamla `accessToken` i `localStorage` tas bort när den nya frontenden startar.
Inloggning, utloggning och ändringar via cookie skyddas också med CSRF-token;
frontendens `apiRequest` sköter det automatiskt.
Dashboardens befintliga anrop till mockservern på port `3001` är en separat koppling.

Cookien gäller i två timmar. Lokal Docker och Development tillåter HTTP;
stage/prod kräver HTTPS och [betrodd proxykonfiguration](DRIFT.md#cookies-och-https).

Detta gäller lokal Docker-körning. I stage/prod måste driftmiljön tillhandahålla
`JWT_KEY`, `POSTGRES_DB`, `POSTGRES_USER` och `POSTGRES_PASSWORD`.

---

## Databasuppgifter

Jag har flyttat databasuppgifterna för `SebPortal.Api` från `appsettings` och
Docker Compose till lokal konfiguration. Det gamla projektet `backend/SebPortal`
ingår inte i denna ändring.

### Med Docker

Öppna `infra/.env`, behåll `JWT_KEY` och lägg till dessa tre rader med era egna värden:

```dotenv
POSTGRES_DB=<databasnamn>
POSTGRES_USER=<databasanvändare>
POSTGRES_PASSWORD=<databaslösenord>
```

Ersätt hela platshållarna, inklusive `<` och `>`. För en befintlig databas ska
värdena matcha den databas ni redan använder. Att redigera `.env` ändrar inte
lösenordet i en befintlig Postgres-databas. För en ny databas väljer ni egna
värden och ett långt slumpmässigt lösenord med bokstäver och siffror.

Compose skickar samma uppgifter till databasen och API:t. Filen är undantagen
från Git och Docker-bygget. Kör `docker compose up --build` från `infra` efter
ändringen. Behåll databasvolymen; ni behöver inte köra `docker compose down -v`.

### Utan Docker för API:t

Spara anslutningen i User Secrets. Ersätt platshållarna med databasens värden
och kör från projektets rot:

```powershell
dotnet user-secrets set 'ConnectionStrings:DefaultConnection' 'Host=localhost;Port=5433;Database=<databasnamn>;Username=<databasanvändare>;Password=<databaslösenord>' --project backend/SebPortal.Api
```

Port `5433` är databasens lokala Docker-port. Starta om backend efteråt.
JWT-nyckeln för denna körning konfigureras enligt avsnittet nedan.

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
Behåll nyckeln mellan starter. Vid byte behöver gamla nyckeln finnas kvar som
`Jwt:PreviousKey` under övergången enligt [nyckelrotation](docs/jwt-key-rotation.md).
JWT skickas bara i en HttpOnly-cookie vid inloggning; signeringsnyckeln stannar i backend.

### 3. Starta om backend

Stoppa backend med **Ctrl+C** om den körs. Starta sedan från projektets rot:

```powershell
dotnet run --project backend/SebPortal.Api --launch-profile http
```

Profilen använder `Development`, där User Secrets läses in automatiskt.
För Docker används i stället [JWT-nyckel för Docker](#jwt-nyckel-för-docker).

### 4. Testa inloggningen

Med databasen igång: starta frontend med `npm run dev` från `frontend` och öppna
adressen som visas i terminalen. Logga in med ert testkonto. Frontendens lokala
`VITE_API_URL` ska vara `http://localhost:5010`.

Kontrollera i **F12 → Network** att `/api/auth/login` ger **200**, att svaret
innehåller `user` och att backend sätter cookien `SebPortal.Auth` med `HttpOnly`.
Anrop till backend använder `credentials: 'include'`. API-flödet och CSRF-headern
beskrivs i [API-kontraktet](contracts/API.md#browser-authentication).

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
