/** Columns of the batch upload file, in order. */
export const BATCH_CSV_COLUMNS = ['from_account_id', 'to_iban', 'amount', 'reference'] as const;

function escapeCsvValue(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * An example batch file (RFC 4180, comma separated). The first reference contains a
 * comma to show how quoting works.
 */
export function buildBatchTemplateCsv(fromAccountId = 1): string {
  const rows: string[][] = [
    [String(fromAccountId), 'SE3550000000054910000003', '5000.00', 'Malmö Bygg, faktura 99'],
    [String(fromAccountId), 'SE0850000000054910000004', '12500.00', 'Faktura 2045'],
    [String(fromAccountId), 'SE3550000000054910000003', '750.50', 'Hyra oktober'],
  ];
  const lines = [BATCH_CSV_COLUMNS.join(','), ...rows.map((row) => row.map(escapeCsvValue).join(','))];
  return `${lines.join('\r\n')}\r\n`;
}
