# Fallback för demo

## Om stage inte går att nå

Kör samma app lokalt med Docker. Förbered först Docker Desktop och `infra/.env` enligt avsnitten [Snabbstart](../README.md#snabbstart), [JWT-nyckel för Docker](../README.md#jwt-nyckel-för-docker), [Databasuppgifter](../README.md#databasuppgifter) och [Lokala testkonton](../README.md#lokala-testkonton).

Från repots rot:

```bash
cd infra
docker compose up --build
```

Öppna sedan [http://localhost:8081](http://localhost:8081). Den lokala databasen får testdata från `infra/seed.sql`. Logga in med en av användarna som står i README och lösenordet som ställts in lokalt via `SEED_TEST_PASSWORD`.

## Enkel demoväg

1. Logga in som initiator och visa översikten.
2. Skapa en betalning och visa bekräftelsen.
3. Om betalningen kräver attest: logga in som attestant, öppna attestkorgen och godkänn den.
4. Visa betalningsstatus och auditloggen.

Betalningsreglerna och vilka steg som kräver attest styrs av backendens konfiguration. Använd därför den betalningsväg som passar seed-datan och miljön ni visar.

## Om även den lokala appen fallerar

Det finns ingen komplett offlineversion av appen i repot. `frontend/mock/db.json` innehåller mockdata för begränsade anrop, men inloggning, betalningar och attest kräver API:t och databasen. Förklara då flödet med API-kontrakten och denna README i stället för att påstå att mockservern är en full demo.

När stage fungerar igen kan ni fortsätta där. Lokala testlösenord och `infra/.env` används bara på den egna datorn och ska inte delas.
