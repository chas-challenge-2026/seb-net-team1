export function canReadAuditLog(role: string | null | undefined): boolean {
  return role === "attestant" || role === "admin";
}
