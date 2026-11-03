# SEB Företagsbetalningar

Ett demonstrationssystem för företagsbetalningar. Initiatorer skapar betalningar, attestanter hanterar betalningar som kräver godkännande och händelser visas i en auditlogg.

Den nuvarande lösningen består av en React-front-end, ett .NET 8 Web API, PostgreSQL och native-moduler för CSV och IBAN. Frontenden byggs in i app-containern för Docker.


## Dokumentation för inlämningen

- [Installation och körning](#snabbstart) och [driftinstruktioner](DRIFT.md).
- [Beslutslogg och bearbetning av feedforward](docs/beslutslogg.md).
- [Testkommandon och teststatus](docs/teststatus.md).
- [Kända brister och avgränsningar](docs/kända-brister.md).
- [Fallback för demo](docs/demo-fallback.md).

Repot är publikt, så PL kan läsa det utan särskild GitHub-inbjudan.

---

## Snabbstart

```bash
git clone https://github.com/chas-challenge-2026/seb-net-team1.git
cd seb-net-team1
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

För popupen med sparade mottagare och BankID-demo, se
[Sparade mottagare](docs/saved-recipients.md). Befintliga databaser behöver
uppdateringen i `infra/migrations/20261013_recipients.sql`.

För IP-adresser i auditloggen, se [IP-adress i auditloggen](docs/audit-ip-address.md).
Befintliga databaser behöver `infra/migrations/20261014_audit_ip_address.sql`
innan den uppdaterade appen startas.

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
`VITE_API_URL` ska vara `http://localhost:8081` när backend körs i Docker. Om du
kör backend direkt med `dotnet run` använder du i stället `http://localhost:5010`.

Kontrollera i **F12 → Network** att `/api/auth/login` ger **200**, att svaret
innehåller `user` och att backend sätter cookien `SebPortal.Auth` med `HttpOnly`.
Anrop till backend använder `credentials: 'include'`. API-flödet och CSRF-headern
beskrivs i [API-kontraktet](contracts/API.md#browser-authentication).

---

## Testa

Kör från repots rot. Backendens integrationstester behöver Docker eftersom de startar en tillfällig PostgreSQL-databas.

```bash
# Native-tester och bygg bibliotek som backend använder
make -C native all

# Backendens unit- och integrationstester
dotnet test backend/SebPortal.Api.Tests/SebPortal.Api.Tests.csproj

# Frontendens tester, bygge och lint
cd frontend
npm ci
npm run test:approvals
npm run build
npm run lint
```

I `frontend/package.json` heter testscriptet `test:approvals`, men det kör alla `tests/*.test.mjs`-filer. Se [teststatus](docs/teststatus.md) för vad CI kör och aktuellt testläge.

---

## Mappstruktur

```
backend/SebPortal.Api/          .NET 8 API och backendlogik
backend/SebPortal.Api.Tests/    Backendens unit- och integrationstester
contracts/                      API-kontrakt
docs/                           Projekt- och inlämningsdokumentation
frontend/                       React- och TypeScript-appen
infra/                          Docker Compose, databas och seed-data
native/                         C-moduler för CSV och IBAN
```

---

## Kända brister

Se [docs/kända-brister.md](docs/kända-brister.md) för nuläget. Bland annat är audit-signering ännu en placeholder, appen gör inga riktiga banköverföringar och den lokala mockdatan ersätter inte API:t för hela appen.

---

## Ursprungligt kravunderlag

[docs/v2-targets.md](docs/v2-targets.md), [docs/architecture.md](docs/architecture.md) och [docs/known-bugs.md](docs/known-bugs.md) beskriver utgångsläget v1 och det ursprungliga v2-kravet. De är bakgrundsmaterial; aktuell implementation och avgränsningar står i dokumenten ovan.

---

## Teknisk stack

- React 18, TypeScript och Vite
- ASP.NET Core 8 Web API och Entity Framework Core 8
- PostgreSQL 12
- C-bibliotek för CSV-tolkning och IBAN-kontroll
- Docker Compose
- JWT i HttpOnly-cookie med CSRF-skydd
