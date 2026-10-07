import type { Account } from "../types/Account";
import { buildApiUrl } from "./apiConfig";

const ACCOUNTS_ENDPOINT = "/accounts";

export async function getAccounts(): Promise<Account[]> {
  const response = await fetch(buildApiUrl(ACCOUNTS_ENDPOINT));

  if (!response.ok) {
    throw new Error("Kunde inte hämta konton.");
  }

  return response.json() as Promise<Account[]>;
}
