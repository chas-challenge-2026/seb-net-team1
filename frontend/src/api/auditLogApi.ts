import type { AuditLogResponse } from "../types/AuditLog";
import { apiRequest } from "./apiClient";

type AuditLogRequest = {
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
}: AuditLogRequest = {}): Promise<AuditLogResponse> {
  const query = new URLSearchParams({ limit: String(limit) });

  if (cursor !== undefined) {
    query.set("cursor", cursor);
  }

  const response = await apiRequest(`/api/audit-log?${query.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new AuditLogApiError(response.status);
  }

  return response.json() as Promise<AuditLogResponse>;
}
