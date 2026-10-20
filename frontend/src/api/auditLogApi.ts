import type { AuditLogFilterOptions, AuditLogFilters, AuditLogResponse } from "../types/AuditLog";
import { apiRequest } from "./apiClient";

type AuditLogRequest = AuditLogFilters & {
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export class AuditLogApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(
      status === 401
        ? "Åtkomst nekad. Logga in igen."
        : status === 403
          ? "Du saknar behörighet"
          : status === 400
          ? "Ogiltiga sök- eller filtervärden. Kontrollera dina val och försök igen."
          : "Kunde inte hämta granskningsloggen. Försök igen."
    );
    this.name = "AuditLogApiError";
    this.status = status;
  }
}

export async function getAuditLog({
  limit = 50,
  cursor,
  signal,
  search,
  action,
  userId,
  from,
  to,
}: AuditLogRequest = {}): Promise<AuditLogResponse> {
  const query = new URLSearchParams({ limit: String(limit) });

  if (cursor !== undefined) {
    query.set("cursor", cursor);
  }

  if (search?.trim()) query.set("search", search.trim());
  if (action) query.set("action", action);
  if (userId !== undefined) query.set("userId", String(userId));
  if (from) query.set("from", from);
  if (to) query.set("to", to);

  const response = await apiRequest(`/api/audit-log?${query.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new AuditLogApiError(response.status);
  }

  return response.json() as Promise<AuditLogResponse>;
}

export async function getAuditLogFilterOptions(signal?: AbortSignal): Promise<AuditLogFilterOptions> {
  const response = await apiRequest("/api/audit-log/filters", { signal });

  if (!response.ok) {
    throw new AuditLogApiError(response.status);
  }

  return response.json() as Promise<AuditLogFilterOptions>;
}
