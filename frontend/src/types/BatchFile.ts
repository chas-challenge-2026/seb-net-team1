export type BatchRowValidationStatus = "valid" | "invalid";

export type BatchPaymentRow = {
  rowNumber: number;
  recordNumber: number;
  fromAccountId: string;
  toIban: string;
  amount: string;
  reference: string;
  normalizedToIban: string;
  errors: string[];
  status: BatchRowValidationStatus;
};

export type BatchValidationSummary = {
  totalRows: number | null;
  validRows: number | null;
  invalidRows: number | null;
  totalAmount: string | null;
};

export type BatchValidationResult = {
  isValid: boolean;
  canValidateRows: boolean;
  header: string[];
  rows: BatchPaymentRow[];
  fileErrors: string[];
  summary: BatchValidationSummary;
};

// Frontend view models, not a proposed backend contract.
export type BatchStatus = "processing" | "completed" | "failed";
export type BatchSort = "created-desc" | "created-asc" | "name" | "size";
export type BatchHistoryQuery = {
  search: string;
  status: BatchStatus | "all";
  fileType: string;
  sort: BatchSort;
};
export type BatchHistoryFile = {
  id: string;
  name: string;
  fileType: string;
  size: number;
  status: BatchStatus;
  createdAt: string;
  validation: BatchValidationResult | null;
  csvContent: string | null;
};
export type BatchHistoryPage = {
  items: BatchHistoryFile[];
  nextCursor: string | null;
  total: number | null;
  start: number;
  counts: Record<BatchStatus, number> | null;
  fileTypes: string[];
};
export type BatchHistorySource = {
  kind: "unavailable" | "development";
  pagination: "client" | "cursor";
  list: (query: BatchHistoryQuery, cursor: string | undefined, signal: AbortSignal) => Promise<BatchHistoryPage>;
  detail: (id: string, signal: AbortSignal) => Promise<BatchHistoryFile | null>;
};
