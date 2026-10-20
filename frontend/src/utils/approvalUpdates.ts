export const APPROVALS_UPDATED_EVENT = "seb:approvals-updated";

export function notifyApprovalsUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(APPROVALS_UPDATED_EVENT));
  }
}
