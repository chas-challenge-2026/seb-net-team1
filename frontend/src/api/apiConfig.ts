const DEFAULT_MOCK_API_URL = "http://localhost:3001";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

// An explicitly empty URL uses the same origin as the page (Docker).
export const API_BASE_URL = configuredApiUrl ?? DEFAULT_MOCK_API_URL;

export function buildApiUrl(path: string): string {
  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${baseUrl}${normalizedPath}`;
}
