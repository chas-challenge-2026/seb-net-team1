# Sparade mottagare

På **Skapa betalning** kan en initiator eller admin lägga till en mottagare med
namn och IBAN. Popupen visar först uppgifterna och sedan en **BankID-demo**.
Användaren bekräftar uttryckligen innan mottagaren sparas och betalningens
IBAN-fält fylls i. En sparad mottagare kan väljas igen efter omladdning.

En vald mottagares IBAN visas som en fast uppgift. Välj alternativet för
manuell inmatning i mottagarlistan om du vill redigera IBAN.

Mottagarna sparas i databasen och delas inom samma företag. Backend kontrollerar
roll, företag, namn, IBAN-format och dubbletter. Skapandet registreras i
auditloggen med användare, tidpunkt och information om att bekräftelsen är
simulerad. Manuell inmatning av IBAN fungerar fortfarande.

## Demo och miljö

BankID-steget är en simulering. Det kontaktar inte BankID och verifierar ingen
identitet eller ägare till ett bankkonto.

Simulerad bekräftelse är aktiverad i `Development`. I andra miljöer är den
avstängd om inte `Recipients:AllowDemoConfirmation` uttryckligen sätts till
`true` (`Recipients__AllowDemoConfirmation=true` som miljövariabel). API:t
visar då fortfarande sparade mottagare, men nekar skapande med demobekräftelse.

## Chromes separata sparfråga

Appens mottagarpopup är centrerad och använder sidans design. Chrome kan också
visa en egen ruta för att spara IBAN i webbläsaren. Den rutan tillhör Chrome;
sidans CSS kan inte ändra dess färger eller placering.

Formulären använder `autocomplete="off"`, och en vald mottagares IBAN visas
utan ett redigerbart formulärfält. Detta garanterar inte att Chrome alltid
avstår från sin egen sparfråga. Inför demon kan den stängas av i Chrome under
**Inställningar → Autofyll och lösenord → Betalningsmetoder → Spara och fyll i
betalningsmetoder**. Se [Chromes hjälp](https://support.google.com/chrome/answer/16580822?hl=sv).
Appens sparade mottagare finns fortfarande i databasen.

## Befintlig lokal databas

Kör uppdateringen från projektets rot innan den nya backendversionen startas:

```powershell
Get-Content -Raw infra/migrations/20261013_recipients.sql |
    docker exec -i seb-db-1 psql -X -U seb -d seb -v ON_ERROR_STOP=1 -f -
```

Kommandot använder projektets vanliga lokala container-, användar- och
databasnamn. Anpassa dem om din miljö har andra namn. Scriptet körs i en
transaktion och skapar mottagartabellen och dess unika index. Befintliga
betalningar och konton behålls. Nya databaser får tabellen från `infra/seed.sql`.

## API

`GET /api/recipients` kräver inloggning och returnerar mottagare i användarens
företag samt `demoConfirmationEnabled`.

`POST /api/recipients` kräver rollen `initiator` eller `admin`, giltig
CSRF-token för cookieanrop och följande JSON:

```json
{
  "name": "Demo Leverantör AB",
  "iban": "SE3550000000054910000003",
  "demoConfirmed": true
}
```

En lyckad skapning returnerar `201` med `id`, `name`, `iban` och `createdAt`.
Ogiltiga uppgifter eller utebliven demobekräftelse ger `400`. En mottagare med
samma normaliserade IBAN inom företaget ger `409`. Otillåten roll eller
avstängd demobekräftelse ger `403`.
