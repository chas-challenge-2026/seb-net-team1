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
