export type User = {
  id: number;
  tenantId: number;
  name: string;
  email: string;
  password: string;
  role: string;
};

const API_URL = "http://localhost:3001";

export async function getUserByEmail(email: string): Promise<User | null> {
  const response = await fetch(
    `${API_URL}/users?email=${encodeURIComponent(email)}`
  );

  if (!response.ok) {
    throw new Error("Kunde inte hämta användare");
  }

  const users: User[] = await response.json();

  return users[0] ?? null;
}