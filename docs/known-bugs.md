# Kända buggar — SEB Företagsbetalningar v1

Dessa buggar är **avsiktliga** och utgör refaktoreringsmål i v2-uppgiften.

---

## BUG-001 — SQL-injektion i inloggning

**Fil:** `Pages/Index.cshtml.cs`  
**Beskrivning:** E-post och lösenordshash interpoleras direkt in i SQL-strängen utan parameterisering. En angripare kan logga in som vilken användare som helst via `' OR '1'='1`.  
**Exempel:** `email = ' OR '1'='1' --`  
**Severity:** Kritisk

---

## BUG-002 — MD5 lösenordshashning

**Fil:** `Pages/Index.cshtml.cs`  
**Beskrivning:** MD5 är kryptografiskt trasigt. Rainbow tables existerar för de flesta vanliga lösenord. Lösenordet `password123` är trivialt att knäcka.  
**Severity:** Kritisk

---

## BUG-003 — IBAN-validering missar kontrollsiffror

**Filer:** `Pages/NewPayment.cshtml.cs`, `Pages/BatchUpload.cshtml.cs`  
**Beskrivning:** Regex `^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$` kontrollerar enbart formatet, inte MOD97-kontrollsumman (ISO 13616). Felaktiga IBAN:er med rätt format godkänns och betalningar skapas mot icke-existerande mottagarkonton.  
**Severity:** Hög

---

## BUG-004 — CSV-parser bryter vid komma i fält

**Fil:** `Pages/BatchUpload.cshtml.cs`  
**Beskrivning:** `string.Split(',')` hanterar inte citerade fält. En referens som `"Malmö Bygg, projektfaktura"` splittras i tre delar, vilket orsakar parsningsfel eller felaktig referens. Fält med ledande/avslutande mellanslag trimmas inte.  
**Severity:** Medel

---

## BUG-005 — Partiell batch-insert utan transaktion

**Fil:** `Pages/BatchUpload.cshtml.cs`  
**Beskrivning:** Varje rad i CSV-filen insertas i en separat databas-query utan övergripande transaktion. Om rad 3 av 10 misslyckas är raderna 1–2 redan committade. Resultatsidan rapporterar "3 av 10 behandlade" men det är oklart vilka som faktiskt insertas.  
**Severity:** Medel

---

## BUG-006 — Inkonsekvent attestationströskel

**Filer:** `Pages/NewPayment.cshtml.cs`, `Pages/ApprovalInbox.cshtml.cs`  
**Beskrivning:** `NewPayment` skapar ett extra atteststeg för betalningar > 500 000 SEK. `ApprovalInbox` förväntar sig dubbel attest vid > 200 000 SEK och försöker retroaktivt lägga till ett andra steg. En betalning på 300 000 SEK fastnar i "pending_approval" permanent eftersom `NewPayment` skapar ett steg men `ApprovalInbox` alltid lägger till ytterligare ett.  
**Severity:** Hög (race condition / dead-lock i flödet)

---

## BUG-007 — Notifieringar sväljs tyst

**Filer:** `Pages/NewPayment.cshtml.cs`, `Pages/ApprovalInbox.cshtml.cs`  
**Beskrivning:** `catch { }` utan kropp kring `SmtpClient.Send()`. Om SMTP-servern inte svarar vet varken systemet eller användaren att notifieringen misslyckades. Attestanter kan missa betalningar som väntar på deras godkännande.  
**Severity:** Medel

---

## BUG-008 — Dubbel och inkonsekvent audit-logg

**Filer:** Samtliga PageModels  
**Beskrivning:** Granskningsloggen skrivs till två platser: PostgreSQL-tabellen `audit_entries` och textfilen `/tmp/audit.log`. Vilken destination som används varierar per händelse:

| Händelse | DB | Fil |
|---|---|---|
| CREATE_PAYMENT | ✅ | ✅ |
| APPROVE_PAYMENT (slutlig) | ✅ | ❌ |
| PARTIAL_APPROVE (delsteg) | ❌ | ✅ |
| REJECT_PAYMENT | ✅ | ✅ |
| BATCH_PAYMENT | ❌ | ✅ |

AuditLog-sidan visar bara DB-poster. Batch-betalningar och delvisa atteststeg syns aldrig i UI:t.  
**Severity:** Medel

---

## BUG-009 — Kontobalans dras inte vid direktbetalning

**Filer:** `Pages/NewPayment.cshtml.cs`, `Pages/ApprovalInbox.cshtml.cs`  
**Beskrivning:** I `NewPayment` sätts status direkt till `completed` för betalningar ≤ 50 000 SEK, men kontobalansen uppdateras aldrig. Balansavdrag sker enbart i `ApprovalInbox.OnPost` (godkännandeflödet). Driftkontot kan visa samma saldo oavsett hur många direktbetalningar som görs.  
**Severity:** Hög

---

## BUG-010 — Hårdkodad uppkopplingssträng på fem ställen

**Beskrivning:** `Host=localhost;Port=5432;Database=seb;Username=seb;Password=seb123` är hårdkodad som fallback i varje PageModel. Credential rotation kräver kompilering.  
**Severity:** Låg (men ett underhållsproblem)

---

## BUG-011 — IDOR i attestkorgen

**Fil:** `Pages/ApprovalInbox.cshtml.cs`  
**Beskrivning:** `approvalStepId` kommer från ett dolt formulärfält. En attestant kan manipulera detta värde och godkänna/avvisa steg som tillhör en annan attestant. Ingen kontroll att `aps.attestant_id == userId`.  
**Severity:** Hög

---

## BUG-012 — Ingen filstorleksgräns för batch-uppladdning

**Fil:** `Pages/BatchUpload.cshtml.cs`  
**Beskrivning:** Kommentaren i UI:t säger "Max 1 MB" men ingen kod enforcar detta. En fil på 100 MB läses in i minnet, vilket kan orsaka OOM.  
**Severity:** Låg
