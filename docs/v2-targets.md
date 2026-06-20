# v2 Mål — SEB Företagsbetalningar

Detta dokument beskriver vad v2 ska uppnå. Era uppgifter är organiserade i moduler — ni behöver inte bygga allt, men varje modul ska ge en märkbar förbättring av kodkvalitet, säkerhet eller skalbarhet.

---

## Backend: .NET 8 Web API

Ersätt Razor Pages-monoliten med ett separat API och ett separat frontend.

### Prioriterade förbättringar

**Lager**
- Inför Repository-mönstret: `IPaymentRepository`, `IUserRepository`, etc.
- Lägg till ett servicelager: `PaymentService`, `ApprovalService`
- Kontrollerna ska bara anropa services — ingen SQL i kontrollern

**ORM**
- Migrera från ADO.NET till Entity Framework Core 8
- Skriv en proper migration-kedja med `dotnet ef migrations add`
- Ingen hårdkodad uppkopplingssträng i källkod

**Autentisering**
- JWT Bearer tokens (ASP.NET Core Identity eller custom)
- Bcrypt/Argon2 lösenordshashning (ta bort MD5)
- Role-based authorization via `[Authorize(Roles = "attestant")]` — inte strängkomparering
- Refresh tokens med rotation

**Notifieringar**
- Ersätt `SmtpClient` med `MailKit` (modern, aktivt underhållen)
- Lägg till en bakgrundskö: `IHostedService` + `Channel<T>` eller Hangfire
- Retry-logik: exponentiell backoff, max 3 försök
- Loggning av misslyckade notifieringar till DB

**IBAN-validering**
- Implementera MOD97-kontrollsumma (ISO 13616)
- Alternativ: anropa native C-modul (se nedan)

**Audit log**
- Samlad loggning: antingen DB eller append-only fil — inte båda
- Strukturerad loggning med Serilog
- Tenant-filtrerad vy i API:t

**Betalningsflöde**
- Kontobalans uppdateras atomärt med betalningsstatus (en transaktion)
- Optimistisk låsning (`rowversion` / `xmin`) för att förhindra dubbla godkännanden
- Idempotency key på betalningsskapande

---

## Frontend: React 18

- Vite + TypeScript
- React Query för serverstate
- Tanstack Router för routing
- Zod för formulärvalidering
- Port 3000 (dev), byggd till statiska filer för produktion

---

## Native C/C++-moduler

Se `native/README.md` för detaljer. Tre kandidater:

### 1. CSV-batchparser (prestandakritisk)
- Hantera RFC 4180-kompatibel CSV (citerade fält, escape-sekvenser)
- Parallell körning med OpenMP
- P/Invoke-bindings från .NET
- Mål: parse 500 rader < 5ms

### 2. IBAN/BIC-validator (ISO 13616)
- MOD97-kontrollsiffra
- BIC-format-validering (ISO 9362)
- Kompileras som ett delat bibliotek (`libiban.so`)
- .NET-wrapper som fallback om biblioteket saknas

### 3. Audit-signering
- Append-only logg med HMAC-SHA256 per post
- Tamper-evidens: varje post kedjas till föregående hash
- Verifieringsfunktion: returnerar första trasiga posten

---

## Infrastruktur

- Dockerfile multi-stage (SDK → runtime) — redan finns, kan förbättras
- docker-compose med healthchecks och volumes
- Nginx reverse proxy med TLS-terminering
- Miljöspecifik konfiguration (dev/staging/prod)

---

## Acceptanskriterier för v2

| Krav | Mät med |
|------|---------|
| Inga SQL-injektioner | CodeQL eller SonarQube scan |
| Bcrypt-lösenord | Unit test på `UserService.CreateUser` |
| IBAN MOD97 korrekt | Parameteriserad testsvit med 50 kända IBAN:er |
| CSV parse RFC 4180 | Testfil med citerade fält, kommanamn, tomrader |
| Atomär balansuppdatering | Integrationtest med concurrent requests |
| Alla audit-händelser i DB | Integrationtest för hela betalningsflödet |
| Notifieringsfel loggas | Mock SMTP som kastar, verifiera DB-post |
| Inga hårdkodade lösenord | `grep -r "seb123"` returnerar tom |
