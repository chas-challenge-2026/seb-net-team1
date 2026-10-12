export type ReportPeriod = {
  from: string;
  to: string;
};

export type ReportPayment = {
  id: number;
  reference: string;
  toIban: string;
  fromAccountName: string | null;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
};

export type PaymentReport = ReportPeriod & {
  timeZone: "Europe/Stockholm";
  payments: ReportPayment[];
};
