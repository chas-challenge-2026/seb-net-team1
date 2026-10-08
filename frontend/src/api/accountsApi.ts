import type { Account } from "../types/Account";
import { apiRequest } from "./apiClient";

const DASHBOARD_ENDPOINT = "/api/dashboard";

type DashboardAccountResponse = {
  id: number;
  accountName: string | null;
  iban: string | null;
  balance: string | null;
  currency: string | null;
};

type DashboardResponse = {
  accounts?: DashboardAccountResponse[];
};

export async function getAccounts(): Promise<Account[]> {
  const response = await apiRequest(DASHBOARD_ENDPOINT);

  if (!response.ok) {
    throw new Error("Kunde inte hämta konton.");
  }

  const dashboard = (await response.json()) as DashboardResponse;

  return (dashboard.accounts ?? []).map((account) => ({
    id: account.id,
    accountName: account.accountName ?? "Okänt konto",
    iban: account.iban ?? "",
    balance: account.balance ?? "0.00",
    currency: account.currency ?? "SEK",
  }));
}
