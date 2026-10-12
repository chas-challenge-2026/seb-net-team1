export type ApprovalAttestant = {
  stepNumber: number;
  name: string | null;
};

export type ApprovalDecisionSource = "manual" | "payment_rejected";

export type ApprovalTimelineStep = {
  approvalStepId: string;
  stepNumber: number;
  status: "pending" | "approved" | "rejected";
  attestantName: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  comment: string | null;
  decisionSource: ApprovalDecisionSource | null;
};

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
  attestants: ApprovalAttestant[];
  timeline: ApprovalTimelineStep[];
};

export type HandledApproval = {
  paymentId: number;
  amount: string;
  status: "approved" | "rejected";
  decidedAt: string | null;
  comment: string;
  decisionSource: ApprovalDecisionSource | null;
  timeline: ApprovalTimelineStep[];
};

export type ApprovalInboxResponse = {
  pending: PendingApproval[];
  recentlyHandled: HandledApproval[];
};

export type ApprovalDecisionRequest = {
  action: "approve" | "reject";
  comment?: string;
};

export type ApprovalDecisionResponse = {
  paymentId: number;
  approvalStepId: string;
  stepStatus: "approved" | "rejected";
  paymentStatus: "completed" | "pending_approval" | "rejected";
};
