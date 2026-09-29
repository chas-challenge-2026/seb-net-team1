import type { Role } from '../api/types';

/** Something only some roles may do. The backend enforces the same rules. */
export type Permission = 'createPayments' | 'approve' | 'admin';

const PERMISSIONS: Record<Permission, readonly Role[]> = {
  createPayments: ['initiator', 'admin'],
  approve: ['attestant', 'admin'],
  admin: ['admin'],
};

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  return role != null && PERMISSIONS[permission].includes(role);
}
