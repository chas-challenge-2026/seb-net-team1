# Arkitektur — SEB Företagsbetalningar v1

## Översikt

SEB Företagsbetalningar är en Razor Pages-monolit byggd med ASP.NET Core 6. Applikationen hanterar betalningsflöden för SME-kunder: en initiator skapar betalningar, attestanter godkänner dem, och allt loggas (delvis) i en granskningslogg.

```
┌─────────────────────────────────────────────────────┐
│              Browser (ingen SPA-ram)                │
└───────────────────┬─────────────────────────────────┘
                    │ HTTP (port 8081)
┌───────────────────▼─────────────────────────────────┐
│           ASP.NET Core 6 Razor Pages                │
│                                                     │
│  Pages/                                             │
│  ├── Index          — Inloggning (MD5, SQL-injektion│
│  ├── Dashboard      — Kontoöversikt                 │
│  ├── NewPayment     — Skapa betalning               │
│  ├── ApprovalInbox  — Attestkorg (500+ rader)       │
│  ├── BatchUpload    — CSV-import (naiv split)       │
│  ├── AuditLog       — Granskningslogg (ofullständig)│
│  └── Logout         — Rensa session                 │
└───────────────────┬─────────────────────────────────┘
                    │ Npgsql (ADO.NET direkt i PageModels)
┌───────────────────▼─────────────────────────────────┐
│              PostgreSQL 12                          │
│  Tabeller: tenants, users, accounts, payments,      │
│  approval_steps, audit_entries                      │
└─────────────────────────────────────────────────────┘

Sidoeffekter (ej i diagrammet):
- /tmp/audit.log — textfil, skrivs parallellt med DB
- SMTP-anrop (System.Net.Mail.SmtpClient) — direkt i PageModels
```

## Lagerstacken (eller bristen på den)

Det finns **inga lager**. Varje PageModel innehåller:

- Databas-queries (ADO.NET, `NpgsqlConnection` direkt)
- Affärslogik (tröskelkontroller, statusövergångar)
- E-postskick (inline `SmtpClient`)
- Auditloggning (till fil OCH databas, inkonsekvent)

Detta gör varje PageModel till en liten "Big Ball of Mud".

## Databasåtkomst

Används: `Npgsql` (raw ADO.NET). Inga ORMs, inga repositories, inga migrations.

Uppkopplingssträngen finns på tre ställen:
1. `appsettings.json` — primär källa
2. Hårdkodad fallback i varje PageModel (`?? "Host=localhost;..."`)
3. `docker-compose.yml` — miljövariabel som överskriver punkt 1

## Autentisering

Session-baserad. `HttpContext.Session` lagrar `UserId`, `Role`, `Name`, `TenantId` som strängar. Lösenord hashas med MD5 (kryptografiskt trasigt).

Rollkontroll sker via `== "attestant"` strängkomparering — ingen policy, inga claims.

## Notifieringar

`System.Net.Mail.SmtpClient` anropas direkt i `NewPayment.OnPost` och `ApprovalInbox.OnPost`. Undantag sväljs tyst. Ingen kö, ingen retry, ingen loggning av misslyckade försök.

## Deployment

Docker Compose med två tjänster: `db` (PostgreSQL 12) och `app` (ASP.NET Core 6). Port 8081. Databas initieras via `seed.sql`.
