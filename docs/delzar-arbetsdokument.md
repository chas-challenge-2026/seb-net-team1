# Mitt arbete i projektet

Namn: Delzar  
Datum: 2026-10-07

Jag har tittat på filmen och lyssnat på feedbacken. I teamet har vi kommit fram till vilka punkter vi ska jobba med. Jag börjar med attestkorgen och godkännandena, sedan går jag vidare till rapporterna.

Jag kollade vilka verktyg jag behöver och kom fram till:

- React och TypeScript för att bygga sidorna.
- React Router för att koppla sidorna till menyn.
- Figma för att följa gruppens design.
- `apiRequest` för att hämta data och skicka beslut till backend.

Jag har skrivit ner följande user stories för arbetet som återstår och tar en i taget:

1. Som attestant vill jag se väntande betalningar, så att jag vet vilka jag behöver granska.
2. Som attestant vill jag se betalningens uppgifter, skapare och attestanter, så att jag kan granska ärendet.
3. Som attestant vill jag godkänna eller avvisa betalningar och se statusen uppdateras, så att mitt beslut blir tydligt.
4. Som attestant vill jag se en tidslinje med vem som godkänt och vem som ska godkänna, så att jag kan följa ärendet.
5. Som attestant vill jag att belopp över 100 000 kr kräver två attestanter, så att beloppsregeln följs.
6. Som användare vill jag välja en period för rapporten, så att jag ser betalningar för rätt tid.

Efter varje story skriver jag vad jag ändrade, varför och hur jag testade det.

## Story 1 – Visa väntande betalningar

Datum: 2026-10-08

Jag lade till sidan `ApprovalInbox.tsx` och kopplade den till Godkännanden i menyn. Sidan hämtar listan från `GET /api/approvals` med `apiRequest` och visar referens, mottagarkonto, belopp, datum och status. Backend bestämmer vilka betalningar den inloggade attestanten får se.

Jag gjorde detta för att attestanten ska kunna se vilka betalningar som behöver granskas. Sidan visar också när data hämtas, när listan är tom och när ett fel uppstår. Det går att uppdatera listan och försöka igen efter ett fel.

Vid testningen upptäckte jag att den befintliga lokala databasen saknade `approval_steps.public_id`, som backendkoden redan kräver. Jag lade till UUID-fältet med standardvärde och unikhetskrav enligt `infra/seed.sql`. Den befintliga betalningen och dess tilldelning behölls.

Jag testade följande:

- `npm.cmd run build` och `npm.cmd run lint` gick igenom.
- Jag loggade in som Johan Berg och öppnade Godkännanden från menyn. Faktura #1043 på 75 000 kr visades från den riktiga backendens lista.
- Jag kontrollerade sidan i dator- och mobilstorlek, inklusive mobilmenyn och tabellens scrollning.
- Jag simulerade tom lista, långsam hämtning och serverfel i webbläsartestet. Meddelandena visades och Försök igen hämtade riktig data igen.
- Jag simulerade saknad inloggning (401) och saknad behörighet (403). Sidan visade rätt meddelande och inga betalningsrader.

Story 1 är klar.

### Test med testkontot

Jag ändrade det befintliga lokala kontot `test@malmobygg.se` från `initiator` till `attestant` och lade in en egen väntande betalning på 75 000 kr med referensen `Testbetalning - attestkorg`. Atteststeget är tilldelat testkontot. Johans befintliga testbetalning behölls.

Jag verifierade datan i databasen och kontrollerade Docker-backendens `GET /api/approvals` med en tillfällig testtoken för testkontots identitet och roll. Svaret var 200 och innehöll den egna testbetalningen, utan Johans betalning.

Testkontot behöver logga ut och in igen eftersom rollen sparas i inloggningstoken. Rollen `attestant` används för att granska och godkänna betalningar och ger inte behörighet att skapa nya betalningar.

## Story 2 – Betalningsuppgifter, skapare och attestanter

Datum: 2026-10-08

Jag kompletterade `GET /api/approvals` så att varje väntande betalning innehåller attestanternas namn och stegnummer. Backend hämtar personerna som är kopplade till betalningens atteststeg och sorterar dem i stegordning. API-kontraktet är uppdaterat med fältet `attestants`.

I frontend går det nu att klicka på betalningens referens under Godkännanden. En detaljvy öppnas med belopp, status, avsändarkonto, mottagarkonto, referens, skapandetid, skapare och attestanter. Om ett atteststeg inte har tilldelats någon visas Inte tilldelad.

Jag gjorde detta för att attestanten ska kunna kontrollera betalningen och vilka personer som är inblandade innan hon fattar ett beslut.

Jag testade följande:

- 58 riktade backendtester för ApprovalService, ApprovalsController och ApprovalsApiIntegration gick igenom. Fyra nya automatiska tester kontrollerar attestanternas namn, ordning, ej tilldelade steg och att behörighetsgränserna mellan användare och företag fortfarande gäller.
- `npm.cmd run build` och `npm.cmd run lint` gick igenom. Backend byggdes också utan fel eller varningar.
- Jag startade om den lokala backenden på port 5010 och testade detaljvyn mot riktig data. Faktura #1043 visade Lisa Persson som skapare och Johan Berg som attestant.
- Jag kontrollerade detaljvyn i dator- och mobilstorlek och att tangentbordsfokus stannar i dialogen. Stängknapparna och Escape stänger dialogen och lämnar tillbaka fokus till betalningen.
- Jag simulerade flera attestanter, ett ej tilldelat steg och saknade uppgifter i webbläsartestet. Rätt namn och reservtexter visades utan fel.

Story 2 är klar.

## Story 3 – Godkänna eller avvisa betalningar

Datum: 2026-10-08

Jag lade till Godkänn och Avvisa i betalningens detaljvy, tillsammans med en valfri kommentar på högst 255 tecken. Beslutet skickas till backendens befintliga `POST /api/approvals/{approvalStepId}/decision` med inloggningscookie och CSRF-token.

När backend bekräftar beslutet visar sidan den nya betalningsstatusen och hämtar attestkorgen igen. Ett godkänt steg kan antingen genomföra betalningen eller lämna den väntande på nästa attestant. Betalningar som har hanterats visas under Senast hanterade med atteststatus, beslutsdatum och kommentar.

Jag gjorde detta för att attestanten ska kunna fatta sitt beslut och direkt se resultatet. Knapparna låses medan beslutet sparas för att förhindra dubbla klick. Om svaret är osäkert eller betalningen redan har hanterats måste listan hämtas igen innan ett nytt beslut kan skickas. Fel visas i detaljvyn utan att ett lyckat beslut påstås.

Den lokala databasen saknade tabellen `transactions` och attestloggens fält `tenant_id`, `signature` och `previous_signature`, som den befintliga backenden behöver. Jag kompletterade schemat och behöll de befintliga posterna. `infra/seed.sql` innehåller nu också transaktionstabellen för nya testdatabaser.

Jag lade till två väntande betalningar på 75 000 kr för `test@malmobygg.se`: `Test - godkann betalning` och `Test - avvisa betalning`. Två separata betalningar tilldelades Johan för verifiering, så att testkontots betalningar finns kvar för manuell testning.

Jag testade följande:

- 27 nya automatiska frontendtester gick igenom med `npm.cmd run test:approvals`. De kontrollerar API-anrop, cookies, CSRF, godkännande, avvisning, fortsatt väntan, behörighetsfel, konflikter och felaktiga svar utan automatiska omsändningar.
- 59 befintliga backendtester för attestflödet gick igenom, inklusive saldoförändring, avvisning, dubbel attest, behörigheter och redan hanterade steg.
- `npm.cmd run build` och `npm.cmd run lint` gick igenom.
- Databasens startskript kördes i ett separat testschema och återställdes med rollback efter kontroll av tabeller och kolumner.
- Jag godkände och avvisade Johans separata testbetalningar i webbläsaren mot den riktiga backenden. Besluten och kommentarerna visades i historiken även efter omladdning. De ursprungliga betalningarna och testkontots betalningar behölls väntande.
- Databaskontrollen visade en genomförd betalning med exakt en transaktion på −75 000 kr och en avvisad betalning utan transaktion. Båda besluten sparades i attestloggen.
- Jag simulerade valideringsfel, redan hanterat steg, nätverksfel och långsam sparning i webbläsaren. Dubbelklick skickade bara ett beslut, Escape kunde inte stänga dialogen under sparning och alla stängningsvägar hämtade listan igen efter ett osäkert svar.
- Jag kontrollerade detaljvyn i dator- och mobilstorlek och att ett godkänt första steg visas som väntande på nästa attestant, utan att betalningen felaktigt påstås vara genomförd.

Story 3 är klar. Nästa steg är story 4: tidslinjen med vem som godkänt och vem som ska godkänna.
