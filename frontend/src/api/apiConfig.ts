const DEFAULT_API_URL = "http://localhost:5010";
const DEFAULT_MOCK_API_URL = "http://localhost:3001";

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

// An explicitly empty URL uses the same origin as the page (Docker).
export const API_BASE_URL = configuredApiUrl ?? DEFAULT_API_URL;
const MOCK_API_URL =
  import.meta.env.VITE_MOCK_API_URL?.trim() || DEFAULT_MOCK_API_URL;

export function buildApiUrl(path: string): string {
  const usesBackendApi = path.startsWith("/api/") || configuredApiUrl !== undefined;
  const baseUrl = (usesBackendApi ? API_BASE_URL : MOCK_API_URL).replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${baseUrl}${normalizedPath}`;
}
