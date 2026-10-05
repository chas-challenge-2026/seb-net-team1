import type {
  BatchPaymentRow,
  BatchValidationResult,
  BatchValidationSummary,
} from "../types/BatchFile";

export const BATCH_CSV_HEADER = [
  "from_account_id",
  "to_iban",
  "amount",
  "reference",
] as const;

export const BATCH_MIN_ROWS = 10;
export const BATCH_MAX_ROWS = 500;
export const BATCH_MAX_FILE_SIZE_BYTES = 1024 * 1024;

type CsvParseResult = {
  records: string[][];
  error: string | null;
};

function parseCsv(content: string): CsvParseResult {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStartedWithQuote = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      field += char;
      continue;
    }

    if (char === '"') {
      if (field.length === 0) {
        inQuotes = true;
        fieldStartedWithQuote = true;
        continue;
      }

      return {
        records,
        error: "CSV-filen innehåller ett ogiltigt citationstecken.",
      };
    }

    if (fieldStartedWithQuote && char !== "," && char !== "\n" && char !== "\r") {
      if (char.trim() === "") {
        continue;
      }

      return {
        records,
        error: "CSV-filen innehåller tecken efter ett avslutat citerat fält.",
      };
    }

    if (char === ",") {
      row.push(field);
      field = "";
      fieldStartedWithQuote = false;
      continue;
    }

    if (char === "\n" || char === "\r") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      fieldStartedWithQuote = false;

      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      continue;
    }

    field += char;
  }

  if (inQuotes) {
    return {
      records,
      error: "CSV-filen saknar avslutande citationstecken.",
    };
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return { records, error: null };
}

function removeEmptyRows(records: string[][]): string[][] {
  return records.filter((record) =>
    record.some((field) => field.trim().length > 0)
  );
}

function normalizeHeaderCell(cell: string): string {
  return cell.replace(/^\uFEFF/, "").trim();
}

function validateHeader(header: string[] | undefined): string[] {
  if (!header) {
    return ["CSV-filen saknar header-rad."];
  }

  if (header.length !== BATCH_CSV_HEADER.length) {
    return [
      `Headern ska ha ${BATCH_CSV_HEADER.length} kolumner: ${BATCH_CSV_HEADER.join(",")}.`,
    ];
  }

  const normalizedHeader = header.map(normalizeHeaderCell);
  const matchesExpectedHeader = BATCH_CSV_HEADER.every(
    (expected, index) => normalizedHeader[index] === expected
  );

  return matchesExpectedHeader
    ? []
    : [
        `Headern måste vara exakt: ${BATCH_CSV_HEADER.join(",")}.`,
      ];
}

function validateRow(record: string[], rowNumber: number): BatchPaymentRow {
  const errors: string[] = [];
  const [fromAccountId = "", toIban = "", amount = "", reference = ""] = record;
  const trimmedFromAccountId = fromAccountId.trim();
  const trimmedToIban = toIban.trim();
  const trimmedAmount = amount.trim();
  const trimmedReference = reference.trim();
  const normalizedToIban = trimmedToIban.replace(/\s+/g, "").toUpperCase();

  if (record.length !== BATCH_CSV_HEADER.length) {
    errors.push(
      `Raden ska ha ${BATCH_CSV_HEADER.length} kolumner men har ${record.length}.`
    );
  }

  if (!/^\d+$/.test(trimmedFromAccountId)) {
    errors.push("Konto-id måste vara ett positivt heltal.");
  } else {
    const accountId = Number(trimmedFromAccountId);

    if (accountId <= 0) {
      errors.push("Konto-id måste vara större än 0.");
    }

    if (accountId > 999999999) {
      errors.push("Konto-id får inte överstiga 999999999.");
    }
  }

  if (!normalizedToIban) {
    errors.push("IBAN måste anges.");
  } else {
    if (normalizedToIban.length > 34) {
      errors.push("IBAN får inte vara längre än 34 tecken.");
    }

    if (!/^[A-Z0-9]+$/.test(normalizedToIban)) {
      errors.push("IBAN får bara innehålla bokstäver och siffror.");
    }
  }

  if (!trimmedAmount) {
    errors.push("Belopp måste anges.");
  } else {
    const amountAsNumber = Number(trimmedAmount);

    if (!Number.isFinite(amountAsNumber)) {
      errors.push("Belopp måste vara ett giltigt nummer med punkt som decimaltecken.");
    } else if (amountAsNumber <= 0) {
      errors.push("Belopp måste vara större än 0.");
    }
  }

  if (trimmedReference.length > 100) {
    errors.push("Referens får inte vara längre än 100 tecken.");
  }

  return {
    rowNumber,
    fromAccountId: trimmedFromAccountId,
    toIban: trimmedToIban,
    amount: trimmedAmount,
    reference: trimmedReference,
    normalizedToIban,
    errors,
    status: errors.length === 0 ? "valid" : "invalid",
  };
}

function createSummary(rows: BatchPaymentRow[]): BatchValidationSummary {
  const validRows = rows.filter((row) => row.status === "valid");
  const totalAmount = validRows
    .reduce((total, row) => total + Number(row.amount), 0)
    .toFixed(2);

  return {
    totalRows: rows.length,
    validRows: validRows.length,
    invalidRows: rows.length - validRows.length,
    totalAmount,
  };
}

function createBlockedSummary(totalRows: number | null): BatchValidationSummary {
  return {
    totalRows,
    validRows: null,
    invalidRows: null,
    totalAmount: null,
  };
}

export function validateBatchCsv(content: string): BatchValidationResult {
  const parseResult = parseCsv(content);

  if (parseResult.error) {
    return {
      isValid: false,
      canValidateRows: false,
      header: [],
      rows: [],
      fileErrors: [parseResult.error],
      summary: createBlockedSummary(null),
    };
  }

  const records = removeEmptyRows(parseResult.records);
  const [headerRecord, ...dataRecords] = records;
  const headerErrors = validateHeader(headerRecord);
  const fileErrors = [...headerErrors];
  const canValidateRows = headerErrors.length === 0;

  if (dataRecords.length < BATCH_MIN_ROWS) {
    fileErrors.push(
      `Batchfilen måste innehålla minst ${BATCH_MIN_ROWS} betalningsrader.`
    );
  }

  if (dataRecords.length > BATCH_MAX_ROWS) {
    fileErrors.push(
      `Batchfilen får innehålla högst ${BATCH_MAX_ROWS} betalningsrader.`
    );
  }

  const rows = canValidateRows
    ? dataRecords.map((record, index) => validateRow(record, index + 2))
    : [];
  const summary = canValidateRows
    ? createSummary(rows)
    : createBlockedSummary(dataRecords.length);

  return {
    isValid: canValidateRows && fileErrors.length === 0 && summary.invalidRows === 0,
    canValidateRows,
    header: headerRecord?.map(normalizeHeaderCell) ?? [],
    rows,
    fileErrors,
    summary,
  };
}
