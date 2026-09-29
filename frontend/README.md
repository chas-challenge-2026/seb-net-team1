# SEB Företagsbetalningar – frontend

React-appen för företagsportalen: översikt, betalningar (manuella och batch), attestkorg,
konton, granskningslogg, rapporter och inställningar. All data kommer från .NET-API:t
enligt API-kontraktet; det finns ingen mockdata i appen.

## Stack

| Del | Val |
| --- | --- |
| Ramverk | React 18 + TypeScript (strict) |
| Byggverktyg | Vite 8 |
| Routing | `@tanstack/react-router` med kodbaserat routeträd (ingen filbaserad codegen) |
| Serverdata | `@tanstack/react-query` för alla anrop, cache och invalidering |
| Validering | `zod` för formulär och för sökparametrar i URL:en |
| Ikoner | `react-icons`, Lucide-setet (`react-icons/lu`) |
| Typsnitt | Inter (`@fontsource-variable/inter`, självhostat) |
| Styling | Handskriven CSS med custom properties, inga UI-kit eller Tailwind |

## Kom igång

Kräver Node.js 20.19+ eller 22.12+.

```bash
npm install
npm run dev        # http://localhost:3000
```

Utvecklingsservern kör på port 3000 (`strictPort`) och vidarebefordrar `/api` och `/health`
till backend på `http://localhost:5010`. Peka om proxyn med miljövariabeln `API_PROXY_TARGET`:

```bash
API_PROXY_TARGET=http://localhost:8081 npm run dev
```

Appen anropar alltid API:t med relativa URL:er (`/api/...`). I Docker serverar backend den byggda
appen från samma origin. Om API:t ligger på en annan origin kan `VITE_API_URL` sättas vid bygget
(t.ex. `VITE_API_URL=https://api.example.com`); backend måste då tillåta CORS med credentials.

I utvecklingsläge visar inloggningssidan knappar för demoanvändarna (Lisa initierare, Johan och
Erik attestanter, Sara administratör, lösenord `password123`). De finns inte i produktionsbygget.

## Skript

| Skript | Gör |
| --- | --- |
| `npm run dev` | Startar Vite med hot reload och API-proxy |
| `npm run build` | Typkontroll (`tsc -b`) och produktionsbygge till `dist/` |
| `npm run typecheck` | Endast typkontroll |
| `npm run lint` | ESLint (TypeScript, React Hooks inklusive React Compiler-reglerna, Fast Refresh) |
| `npm run preview` | Serverar `dist/` lokalt på port 3000, med samma proxy |

## Mappstruktur

```text
src/
├── main.tsx                 Startpunkt: typsnitt, globala stilar, <App />
├── App.tsx                  Providers (React Query, toasts, auth) och routern
├── api/
│   ├── client.ts            fetch-wrapper: bas-URL, JSON, token, ProblemDetails → ApiError, refresh vid 401
│   ├── types.ts             TypeScript-typer för alla DTO:er i kontraktet
│   ├── queryKeys.ts         Nyckelfabrik för React Query + gemensam invalidering
│   ├── queryClient.ts       QueryClient med standardinställningar
│   └── <resurs>.ts          Endpoint-funktioner och hooks per resurs (payments, approvals, …)
├── auth/
│   ├── session.ts           Sessionen i minnet (token + användare), aldrig i localStorage
│   ├── AuthProvider.tsx     Återställer sessionen vid start, login/logout
│   ├── AuthContext.ts       useAuth(), useCurrentUser() och rollhjälpare
│   ├── roles.ts             Vilka roller som får vad
│   └── RoleGate.tsx         Visar "Ingen behörighet" för fel roll
├── routes/
│   ├── router.tsx           Routeträdet, vakter och routerinstansen
│   └── searchSchemas.ts     zod-scheman för sökparametrar (filter, flikar, sidor)
├── components/
│   ├── ui/                  Designsystemets komponenter (Button, Field, Dialog, Tabs, Toast, …)
│   ├── layout/              AppShell, Sidebar, Topbar, notiser, användarmeny, splash
│   ├── payments/            Delade betalningskomponenter (tabell, attestdialog, tidslinje)
│   └── audit/               Aktivitetslista för granskningsposter
├── pages/                   En mapp per sida; sidorna laddas vid behov (code splitting)
├── hooks/                   Små hooks (useNow, useDebouncedValue, useIdempotencyKey, …)
├── utils/                   Pengar, datum, IBAN (MOD97), CSV-mall, etiketter, validering
└── styles/
    ├── tokens.css           Färger, typografi, avstånd, radier, skuggor
    ├── base.css             Reset, typografi, fokus, reducerad rörelse, verktygsklasser
    ├── components.css       Knappar, fält, kort, tabeller, dialoger, toasts …
    ├── layout.css           Appskal, sidomeny, toppfält, responsiv meny
    └── pages/               Sidspecifika stilar
```

## Inloggning och session

1. **Inloggning** – `POST /api/auth/login` ger en åtkomsttoken (JWT, 15 minuter) och användaren.
   Backend sätter samtidigt en refresh-token som httpOnly-cookie (sökväg `/api/auth`), så
   frontend ser den aldrig.
2. **Token i minnet** – åtkomsttoken sparas bara i minnet (`auth/session.ts`), aldrig i
   localStorage. Varje anrop skickar `Authorization: Bearer <token>` och `credentials: "include"`.
3. **Sidladdning** – när appen startar anropas `POST /api/auth/refresh` medan en splashskärm
   visas. Svarar backend 200 är användaren inloggad igen; annars visas inloggningssidan.
4. **Utgången token** – får ett anrop 401 hämtas en ny token via refresh och anropet görs om en
   gång. Samtidiga refresh-anrop slås ihop till ett (backend roterar cookien). Misslyckas refresh
   rensas sessionen och cachen, och användaren skickas till `/login?redirect=<sidan>`.
5. **Utloggning** – `POST /api/auth/logout` återkallar refresh-token; sessionen och all cachad
   data rensas lokalt även om anropet misslyckas.

Routevakter: `/login` skickar inloggade användare vidare, och alla andra sidor ligger under en
layout-route vars `beforeLoad` kräver en inloggad användare. Rollstyrda sidor (ny betalning,
batch, attestkorg, användarhantering) visar "Ingen behörighet" för fel roll. Backend kontrollerar
alltid behörigheten igen.

## Konventioner

- **Pengar** kommer och skickas som decimalsträngar (`"1234.50"`). Beräkningar görs i hela ören,
  visning med `Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' })` →
  `1 234 567,50 kr`. Beloppsfält accepterar decimalkomma.
- **Datum** visas på svenska (`29 sep. 2026 17:01`) och relativt i flöden ("för 5 min sedan").
- **IBAN** visas i grupper om fyra. Formulär kontrollerar längd per land och MOD97 direkt;
  servern är alltid den som avgör.
- **Regler** som beloppsgränser för attest hämtas från `GET /api/config`, aldrig hårdkodade.
- **Filter** på listsidor ligger i URL:en och valideras med zod, så länk, omladdning och
  bakåtknapp fungerar.
- **Fel** från API:t (RFC 7807) visas med sin `detail`-text.
- **Idempotens** – nya betalningar och batchuppladdningar skickas med en `Idempotency-Key` som
  återanvänds om samma inskickning görs om.
