import type { LoginResponse } from "../types/User";
import { apiRequest } from "./apiClient";

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const response = await apiRequest("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  if (!response.ok) {
    throw new Error("Fel e-post eller lösenord");
  }

  return response.json();
}

export async function logout(): Promise<void> {
  const response = await apiRequest("/api/auth/logout", { method: "POST" });

  if (!response.ok) {
    throw new Error("Kunde inte logga ut. Försök igen.");
  }
}
