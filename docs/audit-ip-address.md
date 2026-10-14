# IP-adress i auditloggen

Nya audithändelser sparar anropets IP-adress i `audit_entries.ip_address`.
Adressen visas i auditloggens lista och i popupens valda händelse. Samma uppgift
finns i betalningsdetaljernas `activity`. IPv4 och IPv6 stöds; IPv4-mappad IPv6
visas som IPv4.

Gamla händelser och händelser utan ett HTTP-anrop har `null`. Listan visar `—`
och popupen visar `Uppgift saknas`. En gammal händelse får aldrig IP-adressen
från den som öppnar eller läser den.

## Uppdatera en befintlig lokal databas

Kör i PowerShell från projektets rot med Docker Desktop igång:

```powershell
cd infra
Get-Content -Raw -LiteralPath migrations/20261014_audit_ip_address.sql |
    docker compose exec -T db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
docker compose up -d --build --no-deps app
```

Kör migrationen före den nya API-versionen eftersom den läser den nya kolumnen.
Migrationen kan köras flera gånger och lämnar gamla händelser och signaturer
oförändrade. En ny, tom databas får kolumnen från `infra/seed.sql`.

I stage/prod behöver samma SQL köras mot rätt databas före appuppdateringen.
Det sker inte automatiskt när en befintlig Docker-volym startas om.

### Om frontend använder det lokala API:t på port 5010

Kontrollera `VITE_API_URL` i `frontend/.env`. Om den pekar på
`http://localhost:5010` måste även det lokala API:t byggas om och startas om.
Att uppdatera Docker-appen på port 8081 uppdaterar inte den separata processen
på port 5010. Stoppa den tidigare lokala körningen och starta från projektets rot:

```powershell
dotnet run --project backend/SebPortal.Api --launch-profile http
```

Profilen använder Development och de befintliga User Secrets för databas och JWT.
Händelser som skapades innan rätt API uppdaterades saknar fortfarande IP-adress.

## Adresser bakom Docker och proxy

Backend läser `HttpContext.Connection.RemoteIpAddress` efter appens befintliga
forwarded-header-middleware. En direkt anslutning använder anslutningens adress.
Lokalt kan det vara loopback eller en intern Docker-adress, beroende på hur
trafiken når containern.

Om en reverse proxy används ska den skicka `X-Forwarded-For` och dess faktiska
interna adress ska finnas i `ReverseProxy:KnownProxies`. Exempel på motsvarande
miljövariabel i appcontainern är `ReverseProxy__KnownProxies__0`. Se
[Driftguiden](../DRIFT.md#cookies-och-https) för hur detta konfigureras.
Headers från en obetrodd avsändare får inte ersätta anslutningens IP-adress.

## Kontrollera funktionen

1. Skapa en ny betalning eller fatta ett attestbeslut i appen.
2. Öppna motsvarande händelse i auditloggen och kontrollera IP-adressen i listan
   och popupen.
3. Öppna en äldre händelse utan sparad adress; den ska fortfarande visa `—`.

Automatiska tester täcker lagring, API-svar, IPv4/IPv6, saknad adress och
skillnaden mellan betrodda och obetrodda proxyheaders. Signeringsformatet
inkluderar IP-adressen när den finns och behåller tidigare JSON-format när
adressen saknas.
