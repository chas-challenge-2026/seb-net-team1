export type PaymentPageSlot = number | "leading-ellipsis" | "trailing-ellipsis";

type PaymentPaginationInput = {
  totalItems: number;
  pageSize: number;
  page: number;
};

export function getPaymentPagination({ totalItems, pageSize, page }: PaymentPaginationInput) {
  if (!Number.isSafeInteger(totalItems) || totalItems < 0 ||
      !Number.isSafeInteger(pageSize) || pageSize <= 0 ||
      !Number.isSafeInteger(page) || page <= 0) {
    throw new RangeError("Invalid payment pagination values");
  }

  const totalPages = Math.ceil(totalItems / pageSize);
  const currentPage = totalPages === 0 ? 0 : Math.min(page, totalPages);
  const startIndex = currentPage === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const pages: PaymentPageSlot[] = [];

  if (totalPages <= 7) {
    for (let number = 1; number <= totalPages; number++) pages.push(number);
  } else {
    // Keep the first/last page and a small active-page window, even for large totals.
    const first = Math.max(2, Math.min(currentPage - 1, totalPages - 3));
    const last = Math.min(totalPages - 1, Math.max(currentPage + 1, 4));
    pages.push(1);
    if (first > 2) pages.push("leading-ellipsis");
    for (let number = first; number <= last; number++) pages.push(number);
    if (last < totalPages - 1) pages.push("trailing-ellipsis");
    pages.push(totalPages);
  }

  return { currentPage, totalPages, startIndex, endIndex, pages };
}
