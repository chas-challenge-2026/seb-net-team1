import type { BatchHistoryFile, BatchHistoryPage, BatchHistoryQuery } from "../types/BatchFile";
import { BATCH_CSV_HEADER, validateBatchCsv } from "../utils/batchCsv";
import { filterBatchHistory } from "../utils/batchHistory";
import { BATCH_HISTORY_PAGE_SIZE } from "../utils/batchPagination";

// Explicit, read-only development fixtures. Never imported by the production source.
const examples = [
  ["Payroll_August.csv", "Payroll", "processing"],
  ["Supplier_Payments.csv", "Supplier", "completed"],
  ["SEB_Payments.csv", "SEB", "completed"],
  ["Invoice_Batch.csv", "Invoice", "failed"],
  ["DHL_Payments.csv", "Supplier", "completed"],
] as const;

export const batchFixtures: BatchHistoryFile[] = Array.from({ length: 23 }, (_, index) => {
  const example = examples[index % examples.length];
  const failed = example[2] === "failed";
  const rows = Array.from({ length: failed ? 100 : 10 }, (_, row) => {
    const account = failed && row < 48 ? "0" : "1";
    return `${account},SE8550000000054910000003,125.50,"Utvecklingsexempel, rad ${row + 1}"`;
  });
  const csvContent = [BATCH_CSV_HEADER.join(","), ...rows].join("\n");
  return {
    id: `fixture-${index + 1}`,
    name: index < 5 ? example[0] : example[0].replace(".csv", `_${index + 1}.csv`),
    fileType: example[1], size: new TextEncoder().encode(csvContent).length,
    status: example[2], createdAt: new Date(Date.UTC(2026, 9, 8, 9, 12 - index * 37)).toISOString(),
    csvContent, validation: validateBatchCsv(csvContent),
  };
});

function waitForFixture(signal: AbortSignal, slow: boolean) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, slow ? 1200 : 120);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function readFixturePage(query: BatchHistoryQuery, cursor: string | undefined,
  signal: AbortSignal, mode: "client" | "cursor", scenario: string | null): Promise<BatchHistoryPage> {
  await waitForFixture(signal, scenario === "slow");
  if (scenario === "error") throw new Error("Utvecklingstest: filhistoriken kunde inte hämtas. Försök igen.");
  if (scenario === "page-error" && cursor !== undefined) throw new Error("Utvecklingstest: nästa sida kunde inte hämtas.");
  const all = scenario === "empty" ? [] : batchFixtures;
  const items = filterBatchHistory(all, query);
  const counts = { processing: 0, completed: 0, failed: 0 };
  filterBatchHistory(all, { ...query, status: "all" }).forEach((file) => { counts[file.status] += 1; });
  if (mode === "client") return {
    items, nextCursor: null, total: items.length, start: 0, counts,
    fileTypes: [...new Set(all.map((file) => file.fileType))].sort(),
  };
  // Local cursor simulation is confined to the labelled development source.
  const offset = cursor === undefined ? 0 : Number(cursor.replace(/^fixture-offset:/, ""));
  if (!Number.isSafeInteger(offset) || offset < 0 || (cursor !== undefined && !cursor.startsWith("fixture-offset:"))) {
    throw new Error("Ogiltig utvecklingscursor.");
  }
  return {
    items: items.slice(offset, offset + BATCH_HISTORY_PAGE_SIZE), total: null, start: offset,
    nextCursor: offset + BATCH_HISTORY_PAGE_SIZE < items.length ? `fixture-offset:${offset + BATCH_HISTORY_PAGE_SIZE}` : null,
    counts, fileTypes: [...new Set(all.map((file) => file.fileType))].sort(),
  };
}

export async function readFixtureDetail(id: string, signal: AbortSignal, scenario: string | null) {
  await waitForFixture(signal, scenario === "slow");
  if (scenario === "error") throw new Error("Utvecklingstest: filinformationen kunde inte hämtas.");
  return scenario === "empty" ? null : batchFixtures.find((file) => file.id === id) ?? null;
}
