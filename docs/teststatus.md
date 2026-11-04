# Teststatus

Status kontrollerad 3 november 2026.

## Kör tester lokalt

Kör från repots rot. Backendens integrationstester startar en tillfällig PostgreSQL-container med Testcontainers, så Docker måste vara igång.

```bash
# Native-tester och bygg bibliotek som backend använder
make -C native all

# Backendens unit- och integrationstester
dotnet test backend/SebPortal.Api.Tests/SebPortal.Api.Tests.csproj

# Frontendens tester
cd frontend
npm ci
npm run test:approvals

# Bygg frontend och kontrollera TypeScript
npm run build

# Kör ESLint
npm run lint
```

I `frontend/package.json` heter testscriptet `test:approvals`, men kommandot kör alla `tests/*.test.mjs`-filer.

## Vad CI kör

[CI-workflowen](../.github/workflows/ci.yml) startar på pull requests mot `develop` och `main`. Den bygger native-biblioteken, återställer och bygger .NET-lösningen, kör backendtester med ett täckningskrav på 85 procent och granskar sårbara beroenden.

CI kör för närvarande inte frontendens tester, `npm run build`, `npm run lint` eller native-testmålet `make -C native test`. Kör dessa lokalt enligt kommandona ovan.

## Senast observerade status

- Den senaste push-kontrollen på `develop` som kontrollerades, [infra-guard den 2 november](https://github.com/chas-challenge-2026/seb-net-team1/actions/runs/41465490535), var grön. Den kontrollen verifierar plattformens Compose-regler; den kör inte appens tester.
- CI var grön för [PR #241 den 2 november](https://github.com/chas-challenge-2026/seb-net-team1/actions/runs/41415408113) och för ändringen som kopplar IBAN-kontrollen till native-modulen i [PR #245](https://github.com/chas-challenge-2026/seb-net-team1/actions/runs/41411037310).
- Dokumentationsändringen här har inte följts av en testkörning. CI körs vid pull request, inte vid en vanlig push till `develop`.
