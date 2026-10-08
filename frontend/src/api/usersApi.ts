import type { LoginResponse } from "../types/User";
import { apiRequest } from "./apiClient";

type LoginErrorKind = "invalid-credentials" | "rate-limited" | "network" | "preparation" | "unexpected";

const loginErrorMessages: Record<LoginErrorKind, string> = {
  "invalid-credentials": "Fel e-post eller lösenord.",
  "rate-limited": "För många inloggningsförsök. Vänta en stund och försök igen.",
  network: "Kunde inte nå servern. Kontrollera anslutningen och försök igen.",
  preparation: "Kunde inte förbereda inloggningen. Försök igen.",
  unexpected: "Det gick inte att logga in. Försök igen.",
};

export class LoginError extends Error {
  readonly kind: LoginErrorKind;

  constructor(kind: LoginErrorKind) {
    super(loginErrorMessages[kind]);
    this.name = "LoginError";
    this.kind = kind;
  }
}

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  let response: Response;
  try {
    response = await apiRequest("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });
  } catch (error) {
    throw new LoginError(error instanceof TypeError ? "network" : "preparation");
  }

  if (!response.ok) {
    throw new LoginError(response.status === 401
      ? "invalid-credentials"
      : response.status === 429 ? "rate-limited" : "unexpected");
  }

  try {
    return await response.json();
  } catch (error) {
    throw new LoginError(error instanceof TypeError ? "network" : "unexpected");
  }
}

export async function logout(): Promise<void> {
  const response = await apiRequest("/api/auth/logout", { method: "POST" });

  if (!response.ok) {
    throw new Error("Kunde inte logga ut. Försök igen.");
  }
}
