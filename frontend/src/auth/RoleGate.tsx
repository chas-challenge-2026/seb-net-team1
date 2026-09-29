import type { ReactNode } from 'react';
import { ForbiddenView } from '../pages/errors/ForbiddenView';
import { useAuth } from './AuthContext';
import { hasPermission, type Permission } from './roles';

/** Renders its children only for roles with the permission, otherwise a friendly explanation. */
export function RoleGate({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { user } = useAuth();
  if (!hasPermission(user?.role, permission)) return <ForbiddenView permission={permission} />;
  return <>{children}</>;
}
