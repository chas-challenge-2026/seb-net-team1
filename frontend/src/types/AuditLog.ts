export type AuditEntry = {
  id: number;
  action: string;
  entityType: string | null;
  entityId: number | null;
  description: string;
  createdAt: string;
  userName: string;
  ipAddress?: string | null;
};

export type AuditLogResponse = {
  entries: AuditEntry[];
  nextCursor: string | null;
};

export type AuditLogFilters = {
  search?: string;
  action?: string;
  userId?: number;
  from?: string;
  to?: string;
};

export type AuditLogFilterOptions = {
  actions: string[];
  users: { id: number; name: string }[];
};
