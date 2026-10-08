export const BATCH_HISTORY_PAGE_SIZE = 5;
export const BATCH_REVIEW_PAGE_SIZE = 10;
export type BatchPageSlot = number | "leading" | "trailing";

export function getBatchPageSlots(totalPages: number, current: number): BatchPageSlot[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const first = Math.max(2, Math.min(current - 1, totalPages - 3));
  const last = Math.min(totalPages - 1, Math.max(current + 1, 4));
  return [1, ...(first > 2 ? ["leading" as const] : []),
    ...Array.from({ length: last - first + 1 }, (_, index) => first + index),
    ...(last < totalPages - 1 ? ["trailing" as const] : []), totalPages];
}

export function getBatchPagination(total: number, requestedPage: number, pageSize: number) {
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(pageSize) || pageSize < 1 ||
    !Number.isSafeInteger(requestedPage) || requestedPage < 1) throw new RangeError("Invalid batch pagination");
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 0 : Math.min(requestedPage, totalPages);
  const start = page === 0 ? 0 : (page - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  return { page, totalPages, start, end, slots: getBatchPageSlots(totalPages, page) };
}

export type BatchCursorHistory = { cursors: (string | undefined)[]; index: number };
export function commitBatchCursor(history: BatchCursorHistory, index: number, cursor: string | undefined,
  nextCursor: string | null): BatchCursorHistory {
  if (index < 0 || index > history.cursors.length) throw new RangeError("Unreachable batch page");
  const known = history.cursors[index] === cursor && index < history.cursors.length;
  let cursors = known ? [...history.cursors] : [...history.cursors.slice(0, index), cursor];
  if (cursors[index + 1] !== nextCursor) cursors = cursors.slice(0, index + 1);
  return { cursors, index };
}
