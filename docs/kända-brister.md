# Kända brister och avgränsningar

Det här dokumentet beskriver nuläget i den nuvarande React- och .NET-versionen.

- **Audit-signering är inte färdig.** `UnsignedPlaceholderAuditSigner` returnerar markören `UNSIGNED`. Den ger ingen kryptografisk signatur och gör inte loggen manipulationssäker.
- **Ingen riktig banköverföring görs.** Appen demonstrerar betalningsflöden och sparar status i databasen. Den är inte ansluten till SEB:s betalningssystem.
- **BankID-flödet är en demo.** Compose-konfigurationen aktiverar demobekräftelse för mottagare. Det är inte en riktig BankID-integration.
- **Frontendens automatiska testtäckning är begränsad.** Testerna och bygg-/lintkommandona finns, men CI kör i dag inte frontendtester, frontendbygge eller lint. Se [teststatus](teststatus.md).
- **Offlinefallback saknas för hela appen.** Mockdata i `frontend/mock/db.json` kan inte ersätta API och databas för inloggning, betalningar och attest. Se [demo-fallback](demo-fallback.md).
- **Drift kräver konfiguration.** Docker behöver lokala miljövärden för JWT och PostgreSQL. Stage/prod behöver dessutom korrekt HTTPS- och proxykonfiguration enligt [DRIFT.md](../DRIFT.md).

Dokument som [known-bugs.md](known-bugs.md), [architecture.md](architecture.md) och [v2-targets.md](v2-targets.md) beskriver huvudsakligen utgångsläget v1 och de ursprungliga v2-målen. De är bakgrundsmaterial, inte en aktuell lista över brister i koden.
