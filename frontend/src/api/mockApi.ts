export const MOCK_API_URL = (import.meta.env.VITE_MOCK_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

export function buildMockUrl(path: string) {
  return `${MOCK_API_URL}/${path.replace(/^\//, "")}`;
}

export async function getMockRows<T>(resource: string, signal?: AbortSignal): Promise<T[]> {
  const response = await fetch(buildMockUrl(resource), { signal });
  if (!response.ok) throw new Error(`Kunde inte hämta ${resource}.`);
  return response.json();
}
