export type BatchRowValidationStatus = "valid" | "invalid";

export type BatchPaymentRow = {
  rowNumber: number;
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
