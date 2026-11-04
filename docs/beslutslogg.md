# Beslutslogg

Den här loggen sammanfattar beslut som syns i den nuvarande koden på `develop` och varför de passar projektet. Den kompletterar Git-historiken.

| Beslut | Varför |
|---|---|
| Dela upp lösningen i en React-front-end och ett .NET 8 API. | Gränssnitt och betalningslogik kan utvecklas och testas var för sig. I Docker byggs frontenden till statiska filer och följer med API:t i samma app-container, vilket passar projektets driftsättningskrav. |
| Använd PostgreSQL och Entity Framework Core med repositories och services. | Databasåtkomst och affärslogik hålls samlade och går att testa utan att lägga SQL i varje controller. |
| Lagra inloggningens JWT i en HttpOnly-cookie och skydda ändringar med CSRF-token. | Webbläsarens JavaScript kan inte läsa autentiseringscookien. CSRF-skyddet behövs eftersom webbläsaren skickar cookien automatiskt. |
| Kräv en idempotency-nyckel när en betalning skapas. | Om användaren skickar om samma begäran ska inte en extra betalning skapas. Samma nyckel med annat innehåll avvisas. |
| Anropa C-modulerna för CSV-tolkning och IBAN-kontroll från .NET. | Modulerna implementerar de delar som projektets krav pekar ut för native-kod. Backend bygger på dem via P/Invoke; både native- och API-tester finns i repot. |

## Bearbetning av feedforward

Vi har stämt av feedforward mot projektets krav, API-kontrakt och befintlig kod. Förslag som går att omsätta och kontrollera har arbetats in i kod och tester. Ett exempel i GitHub-historiken är förslaget att koppla betalningarnas IBAN-kontroll till den befintliga native-modulen. Det genomfördes senare genom att `PaymentService` använder `libiban`, med test för felaktig landskod och längd. Kvarstående arbete, som riktig audit-signering, står i [kända brister](kända-brister.md).

## Underlag i repot

- [API-kontrakt](../contracts/API.md)
- [Native IBAN-modul](native-iban-usage.md)
- [Drift och deploy](../DRIFT.md)
- Exempel på feedforward: [PR #202](https://github.com/chas-challenge-2026/seb-net-team1/pull/202), genomförd ändring: [PR #245](https://github.com/chas-challenge-2026/seb-net-team1/pull/245)
