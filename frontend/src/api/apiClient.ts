import { buildApiUrl } from "./apiConfig";

// Use this client for the authenticated backend under /api.
export async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    // Fetch a fresh token because login and logout change the current identity.
    const csrfResponse = await fetch(buildApiUrl("/api/auth/csrf"), {
      credentials: "include",
      cache: "no-store",
    });

    if (!csrfResponse.ok) {
      throw new Error("Kunde inte förbereda anropet. Försök igen.");
    }

    const csrfPayload = await csrfResponse.json();
    const requestToken = csrfPayload?.requestToken;
    if (typeof requestToken !== "string" || !requestToken) {
      throw new Error("Kunde inte förbereda anropet. Försök igen.");
    }

    headers.set("X-CSRF-TOKEN", requestToken);
  }

  return fetch(buildApiUrl(path), {
    ...options,
    method,
    headers,
    credentials: "include",
  });
}
