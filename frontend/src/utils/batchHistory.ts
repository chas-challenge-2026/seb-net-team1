import type { BatchHistoryFile, BatchHistoryQuery } from "../types/BatchFile";

export const DEFAULT_BATCH_QUERY: BatchHistoryQuery = {
  search: "", status: "all", fileType: "all", sort: "created-desc",
};

export function filterBatchHistory(items: BatchHistoryFile[], query: BatchHistoryQuery) {
  const term = query.search.trim().toLocaleLowerCase("sv-SE");
  return items.filter((item) => (query.status === "all" || item.status === query.status) &&
    (query.fileType === "all" || item.fileType === query.fileType) &&
    (!term || `${item.name} ${item.fileType}`.toLocaleLowerCase("sv-SE").includes(term)))
    .sort((a, b) => {
      if (query.sort === "name") return a.name.localeCompare(b.name, "sv-SE") || a.id.localeCompare(b.id);
      if (query.sort === "size") return b.size - a.size || a.id.localeCompare(b.id);
      const order = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return (query.sort === "created-asc" ? -order : order) || a.id.localeCompare(b.id);
    });
}

export function filterBatchRows<T extends { status: string; rowNumber: number; fromAccountId: string;
  toIban: string; amount: string; reference: string; errors: string[] }>(rows: T[], status: string, search: string): T[] {
  const term = search.trim().toLocaleLowerCase("sv-SE");
  return rows.filter((row) => (status === "all" || row.status === status) &&
    (!term || [row.rowNumber, row.fromAccountId, row.toIban, row.amount, row.reference, ...row.errors]
      .join(" ").toLocaleLowerCase("sv-SE").includes(term)));
}
