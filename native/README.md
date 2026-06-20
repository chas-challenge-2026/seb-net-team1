# Native C/C++ Moduler — v2

Denna katalog innehåller (i v2) tre prestandakritiska och säkerhetskritiska moduler implementerade i C/C++. De anropas från .NET via P/Invoke.

## Varför native?

1. **CSV-parsern** ska hantera batchfiler på 10 000+ rader med parallell körning. En ren .NET-implementation är tillräcklig för v1:s 500-radersgräns men skalas inte till produktionsvolymer.

2. **IBAN-validatorn** implementerar ISO 13616 MOD97-algoritmen. En C-implementation är trivial att formellt verifiera och enkelt att porta till mobilklienter (iOS/Android via FFI).

3. **Audit-signeringen** kräver kryptografisk integritet. En HMAC-SHA256-kedja i C är lättare att granska och auditeras utan .NET runtime-beroenden.

---

## Modul 1: CSV-batchparser

**Fil:** `csv_parser.c` / `csv_parser.h`  
**Kompilering:** `gcc -O2 -fopenmp -shared -fPIC -o libcsvparser.so csv_parser.c`

### API

```c
typedef struct {
    int     from_account_id;
    char    to_iban[35];
    double  amount;
    char    reference[101];
    int     valid;         // 1 = ok, 0 = parsningsfel
    char    error[256];    // felmeddelande om valid == 0
} CsvRow;

// Parsar CSV-innehåll. Allokerar och returnerar array av CsvRow.
// rows_out: antal rader (exkl. header)
// Anroparen ansvarar för att frigöra minnet med free_csv_rows().
CsvRow* parse_csv(const char* content, int content_len, int* rows_out);

void free_csv_rows(CsvRow* rows);
```

### .NET P/Invoke-wrapper (ska implementeras)

```csharp
[DllImport("libcsvparser", CallingConvention = CallingConvention.Cdecl)]
private static extern IntPtr parse_csv(string content, int contentLen, out int rowsOut);

[DllImport("libcsvparser", CallingConvention = CallingConvention.Cdecl)]
private static extern void free_csv_rows(IntPtr rows);
```

### Krav
- RFC 4180-kompatibel (citerade fält med inbäddade kommatecken och radbrytningar)
- OpenMP parallellism: varje tråd processar ett CSV-segment
- Mål: 500 rader < 5 ms, 10 000 rader < 50 ms på 4-kärna

---

## Modul 2: IBAN/BIC-validator

**Fil:** `iban_validator.c` / `iban_validator.h`  
**Kompilering:** `gcc -O2 -shared -fPIC -o libiban.so iban_validator.c`

### API

```c
// Returnerar 1 om IBAN är giltig (format + MOD97), annars 0
// error_out: om 0 returneras, sätts till felkod
//   1 = för kort/lång
//   2 = ogiltigt landskod
//   3 = felaktigt tecken
//   4 = MOD97-fel (fel kontrollsiffror)
int validate_iban(const char* iban, int* error_out);

// Returnerar 1 om BIC är giltig (ISO 9362), annars 0
int validate_bic(const char* bic);

// MOD97-kontrollsiffra — returnerar beräknad checksumma (0-97)
int iban_mod97(const char* iban);
```

### Algoritm (ISO 13616 MOD97)

1. Flytta de första 4 tecknen sist
2. Ersätt varje bokstav med dess numeriska värde (A=10, B=11, ..., Z=35)
3. Beräkna MOD 97 på den resulterande heltalssträngen
4. Resultatet ska vara 1

### .NET P/Invoke-wrapper (ska implementeras)

```csharp
public static bool ValidateIban(string iban)
{
    if (!NativeLibraryAvailable) return FallbackValidateIban(iban); // regex fallback
    int errorCode = 0;
    return NativeMethods.validate_iban(iban.Replace(" ", ""), ref errorCode) == 1;
}
```

---

## Modul 3: Audit-signering (append-only, tamper-evident)

**Fil:** `audit_signer.c` / `audit_signer.h`  
**Kompilering:** `gcc -O2 -shared -fPIC -o libauditsigner.so audit_signer.c -lssl -lcrypto`

### Format

Varje loggrad: `TIMESTAMP|USER_ID|ACTION|ENTITY_ID|DESCRIPTION|PREV_HASH|HMAC`

- `PREV_HASH`: SHA256 av föregående rads hela innehåll (hex)
- `HMAC`: HMAC-SHA256(rad_utan_hmac, secret_key) (hex)
- Första radens `PREV_HASH` = `0000...0000` (64 nollor)

### API

```c
// Lägg till en loggrad. Hämtar föregående hash från log_path automatiskt.
// Returnerar 0 vid lyckat skrivande, -1 vid fel.
int audit_append(
    const char* log_path,
    const char* secret_key,
    int user_id,
    const char* action,
    int entity_id,
    const char* description
);

// Verifiera hela loggfilen. Returnerar -1 om ok, annars radnummer för
// första trasiga posten (1-indexerat).
int audit_verify(const char* log_path, const char* secret_key);
```

### Säkerhetskrav
- `secret_key` ska aldrig lagras i källkod — läses från miljövariabel `AUDIT_SIGNING_KEY`
- Filen ska öppnas med `O_APPEND | O_SYNC` för att förhindra partiella skrivningar
- Verifiering ska köras vid applikationsstart och rapporteras i healthcheck

---

## Bygga alla moduler

```bash
cd native/
make all   # kompilerar alla tre .so-filer
make test  # kör enhetstester (kräver check.h eller cmocka)
```

Makefile (ska skapas i v2):
```makefile
CC = gcc
CFLAGS = -O2 -Wall -fPIC
LDFLAGS = -shared

all: libcsvparser.so libiban.so libauditsigner.so

libcsvparser.so: csv_parser.c
	$(CC) $(CFLAGS) -fopenmp $(LDFLAGS) -o $@ $<

libiban.so: iban_validator.c
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $<

libauditsigner.so: audit_signer.c
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $< -lssl -lcrypto

clean:
	rm -f *.so
```
