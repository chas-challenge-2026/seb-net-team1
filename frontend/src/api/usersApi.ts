import type { LoginResponse } from "../types/User";

const API_URL = "http://localhost:5010";

export async function login(
  email: string,
  password: string
): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/api/auth/login`, {
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