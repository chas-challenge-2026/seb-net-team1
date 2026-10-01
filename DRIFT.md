# Drift och deploy - läs detta först

Denna guide riktar sig särskilt till teamets driftansvariga, men alla i teamet bör känna till innehållet.

## Köra lokalt

Krav: Docker Desktop (Windows/Mac) eller Docker Engine (Linux). På Windows behöver Docker Desktop WSL2, se vanliga fel nedan.

Första gången: skapa `infra/.env` med [JWT-nyckeln](README.md#jwt-nyckel-för-docker)
och [databasuppgifterna](README.md#databasuppgifter). För en befintlig databas måste
uppgifterna matcha den befintliga databasen; en ändring i `.env` byter inte dess lösenord.

```bash
cd infra
docker compose up --build
```

Appen svarar sedan på http://localhost:PORT. Vilken port som gäller för ert case står i `infra/docker-compose.override.yml`. Aktivera [lokala testkonton](README.md#lokala-testkonton) enligt README; lösenordet väljs lokalt.

- Stoppa: Ctrl+C, eller `docker compose down`
- Börja om med tom databas: `docker compose down -v` och sedan `up --build` igen

## Vanliga fel lokalt

- **"WSL 2 installation is incomplete" (Windows):** kör `wsl --install` i PowerShell som administratör, starta om datorn, starta Docker Desktop igen.
- **"port is already allocated":** någon annan process använder porten. Stäng den, eller ändra porten i `infra/docker-compose.override.yml` (den filen är er att ändra).
- **Kodändringar syns inte:** ni har glömt `--build`.
- **Databasen i konstigt läge:** `docker compose down -v` och börja om. Volymen är bara lokal, inget försvinner i driftmiljön.

## Så funkar deploy

- Driftmiljön måste tillhandahålla `JWT_KEY`, `POSTGRES_DB`, `POSTGRES_USER` och `POSTGRES_PASSWORD` när Docker Compose körs. Den lokala `infra/.env` följer inte med i Git eller Docker-imagen.

- JWT stöder en valfri `JWT_PREVIOUS_KEY` vid planerad rotation. Följ
  [rotationsguiden](docs/jwt-key-rotation.md), särskilt ordningen för flera
  instanser och väntetiden innan gamla nyckeln tas bort. Nycklar läses vid start;
  återskapa containrar efter byte. Extern secret manager är ännu inte ansluten.

- `SEED_TEST_PASSWORD` och lösenordsscriptet används bara av den lokala Compose-override-filen. Grundkonfigurationen skapar nya testkonton utan användbara lösenord. Befintliga testkonton i stage/prod behöver granskas separat; seed körs inte igen på en befintlig databas.

- Push till `develop` bygger om er stage-miljö, push till `main` bygger om prod. Adresserna står i README.
- Grön bock eller rött X på committen i GitHub visar hur deployen gick. Vid rött X: klicka på markeringen och läs byggloggen.
- **Ett misslyckat bygge sänker inte er miljö.** Senast fungerande version fortsätter köra tills ett nytt bygge går igenom.
- Bygget tar några minuter. Vid deadline pushar alla team samtidigt och kön blir längre: pusha i god tid.
- Arbetsflöde: testa alltid på `develop` innan ni mergar till `main`.

## Cookies och HTTPS

JWT lagras i `SebPortal.Auth`, en HttpOnly-cookie med `SameSite=Strict` och
två timmars giltighet. Inloggning, utloggning och ändringar med cookie kräver
CSRF-token. Frontend och API ska ligga på samma publika adress i Docker.

Stage/prod använder `Secure` som standard. Bara lokal Development och
`docker-compose.override.yml` sätter `Auth:AllowInsecureCookies=true` för HTTP.
Använd inte den inställningen i drift.

När HTTPS avslutas i plattformens reverse proxy måste den skicka
`X-Forwarded-Proto: https`. Driftansvarig behöver ange proxyns faktiska interna
IP-adress som `ReverseProxy__KnownProxies__0` i **appcontainerns** miljö
(fler adresser får index 1, 2, …). Lägg inställningen i driftens Compose-overlay
eller motsvarande containerkonfiguration; en variabel bara i Compose-terminalen
skickas inte automatiskt in i containern. Utan konfiguration betros bara loopback.
Betro inte alla avsändare. Kontrollera detta med plattformsansvarig inför deploy;
den lokala Docker-kontrollen verifierar inte driftens proxy.

Kontrollera efter deploy att `/api/auth/csrf` ger 200 över HTTPS, att inloggningen
sätter `Secure` och `HttpOnly`, och att dashboard ger 401 efter utloggning.

## Plattformskontraktet - fyra regler

Er deploy-miljö kräver att:

1. `infra/docker-compose.yml` ligger kvar på sin plats
2. webbtjänsten heter `app`
3. `expose` används i `infra/docker-compose.yml`, aldrig `ports` (lokala portar hör hemma i `docker-compose.override.yml`)
4. appens faktiska lyssningsport matchar expose-värdet

En automatisk kontroll körs på varje push och ger rött X med förklaring om regel 1-3 bryts. Regel 4 kan inte kontrolleras automatiskt: byter ni port appen lyssnar på, uppdatera expose-värdet samtidigt.

Allt annat är fritt fram: uppgradera språkversion, ramverk, basimages i Dockerfile, lägga till tjänster i composen och så vidare.

## Byta Postgres-version (v2-kravet)

Databasvolymen i er driftmiljö innehåller datafiler från nuvarande Postgres-version. Byter ni bara image-version startar databasen inte. Gör så här:

1. Testa lokalt först (`docker compose down -v` ger er en färsk lokal volym).
2. Skicka ett techsupport-ärende (kategori "Deploy & CI") INNAN ni pushar versionsbytet till `develop`/`main`, och skriv att ni behöver databas-reset för Postgres-versionsbyte.
3. Vi nollställer volymen i driftmiljön i samband med er deploy.

## Nollställa databasen i driftmiljön

Ni kan inte själva nollställa databasen i stage/prod. Skicka ett techsupport-ärende: https://chas-challenge.comerit.se/support/

## Frontend i v2

Bygg frontenden i samma Dockerfile som backend (eget byggsteg som kopierar in byggresultatet i backend-imagen). En separat frontend-container får ingen egen publik adress.
