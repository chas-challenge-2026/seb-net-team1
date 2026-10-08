export type PendingApproval = {
  paymentId: number;
  approvalStepId: string;
  toIban: string;
  amount: string;
  currency: string;
  reference: string;
  createdAt: string;
  createdByName: string;
  fromAccountName: string;
  currentStep: number;
  totalSteps: number;
  requiresDoubleApproval: boolean;
};

export type HandledApproval = {
  paymentId: number;
  amount: string;
  status: "approved" | "rejected";
  decidedAt: string | null;
  comment: string;
};

export type ApprovalInboxResponse = {
  pending: PendingApproval[];
  recentlyHandled: HandledApproval[];
};
