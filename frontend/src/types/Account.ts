export type Account = {
  id: number;
  accountName: string;
  iban: string;
  balance: string;
  currency: string;
  balanceHistory: { month: string; balance: string }[];
};
