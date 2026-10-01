# Byta JWT-signeringsnyckel

Backend stöder en aktiv nyckel och en valfri föregående nyckel.
Nya token signeras alltid med den aktiva. Båda kan verifiera token under övergången.
Token gäller i två timmar; gamla token utan nyckel-id (`kid`) fungerar också.
Byt inte nyckeln vid varje start.

| Användning | .NET-konfiguration / User Secrets | Appcontainerns miljö | Compose / `infra/.env` |
|---|---|---|---|
| Signera nya token och verifiera | `Jwt:Key` | `Jwt__Key` | `JWT_KEY` |
| Verifiera tidigare token | `Jwt:PreviousKey` | `Jwt__PreviousKey` | `JWT_PREVIOUS_KEY` |

Nycklarna måste vara olika och minst 32 UTF-8-byte långa. Skapa dem från
32 slumpmässiga byte enligt nedan. Befintliga Base64-strängar används fortfarande
som UTF-8-text; ändra inte hur befintliga nycklar kodas.

Konfigurationen läses vid start. Signering och verifiering använder samma
konfiguration tills API:t startas om. Det finns ingen automatisk rotation eller
automatisk borttagning av den föregående nyckeln.

## Lokal Docker: en appcontainer

1. Bygg först versionen som stöder rotation, med nuvarande nyckel kvar:

   ```powershell
   docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up -d --build app
   ```

2. Skapa en ny slumpmässig nyckel i PowerShell:

   ```powershell
   $bytes = New-Object byte[] 32
   $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
   $rng.GetBytes($bytes)
   $rng.Dispose()
   [Convert]::ToBase64String($bytes)
   ```

3. Öppna den Git-ignorerade filen `infra/.env`. Kopiera det nuvarande värdet för
   `JWT_KEY` till `JWT_PREVIOUS_KEY`. Sätt sedan den nya nyckeln som `JWT_KEY`.
   Behåll övriga inställningar. Dela inte nycklarna i Git eller chatten.

   ```dotenv
   JWT_KEY=<den nya nyckeln>
   JWT_PREVIOUS_KEY=<den gamla nyckeln>
   ```

4. Återskapa appcontainern från projektets rot så att nya miljövärden läses:

   ```powershell
   docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up -d --force-recreate --no-deps app
   ```

   En vanlig `docker compose restart` läser inte om `.env`. Databasen behöver
   inte startas om eller nollställas. Anteckna tiden då den gamla appcontainern
   slutade signera token. Kontrollera att en redan inloggad webbläsare fortfarande
   kan läsa `/api/dashboard`, och att en ny inloggning i ett separat fönster fungerar.

5. Vänta **minst två timmar plus marginal** från det sista tillfället då gamla
   nyckeln användes för signering. Använd exempelvis **två timmar och fem minuter**.
   Ta sedan bort raden `JWT_PREVIOUS_KEY` och kör kommandot i steg 4 igen.
   Påbörja inte ytterligare ett byte medan föregående nyckel fortfarande behövs.

Om du kör API:t utan Docker använder du motsvarande User Secrets-inställningar
i tabellen och startar om `dotnet run` efter varje ändring. Ta bort den gamla med
`dotnet user-secrets remove 'Jwt:PreviousKey' --project backend/SebPortal.Api`
först efter väntetiden.

## Flera instanser i drift

När flera instanser kör samtidigt måste alla kunna verifiera den nya nyckeln
innan någon börjar signera med den. Kalla den gamla nyckeln A och den nya B:

1. Förbered alla instanser med A som aktiv och B i `PreviousKey`-platsen.
   Här används platsen tillfälligt för nästa verifieringsnyckel. Kontrollera att
   samtliga instanser har uppdaterats.
2. Byt till B som aktiv och A som föregående på alla instanser.
3. Vänta två timmar plus marginal från att **sista** instansen slutade signera med A.
4. Ta bort A från konfigurationen och återskapa samtliga instanser.

Ett byte direkt från A-only till B/A under en rullande deploy gör att kvarvarande
A-only-instanser inte kan verifiera nya token. Välj inte en sådan övergång.
Om en nyckel har läckt ska den tas bort omedelbart; då behöver berörda användare logga in igen.

## Extern secret manager

Ingen extern secret manager är ansluten ännu. `infra/.env` och User Secrets är
lokal konfiguration, inte en sådan tjänst. Tjänst och åtkomst behöver väljas
tillsammans med driftansvarig innan den delen kan kopplas in och verifieras.

Vid anslutning behöver driften leverera aktiv och föregående nyckel från samma
planerade version till appen enligt tabellen ovan. Enbart en variabel på drifthosten
når inte automatiskt containern: grund-Compose läser `JWT_KEY` och
`JWT_PREVIOUS_KEY` och skickar dem vidare som `Jwt__Key` och `Jwt__PreviousKey`.
Återskapa appinstanserna när versionen byts och följ övergången ovan.

## Automatiska tester

Kör från projektets rot:

```powershell
dotnet test backend/SebPortal.Api.Tests --filter FullyQualifiedName~JwtKeyRotationIntegrationTests
```

Testerna använder egna slumpmässiga nycklar. De verifierar gammal och ny token
under rotation, borttagning av gammal nyckel, cookies och Bearer-header, utgångna
eller felaktigt signerade token samt att konfigurationen inte byts mitt under körning.
