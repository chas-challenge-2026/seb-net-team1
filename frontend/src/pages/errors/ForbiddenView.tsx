import { Link } from '@tanstack/react-router';
import { LuArrowLeft, LuLock } from 'react-icons/lu';
import { useAuth } from '../../auth/AuthContext';
import type { Permission } from '../../auth/roles';
import { buttonClass } from '../../components/ui/buttonClass';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROLE_LABELS } from '../../utils/labels';

const EXPLANATIONS: Record<Permission, string> = {
  createPayments: 'Det är bara initierare och administratörer som kan skapa betalningar.',
  approve: 'Det är bara attestanter och administratörer som kan attestera betalningar.',
  admin: 'Den här delen är bara tillgänglig för administratörer.',
};

/** Shown instead of a page the current role may not use. */
export function ForbiddenView({ permission }: { permission: Permission }) {
  const { user } = useAuth();
  useDocumentTitle('Ingen behörighet');

  return (
    <div className="status-page">
      <span className="status-page__icon tone-warning">
        <LuLock aria-hidden="true" />
      </span>
      <h1 className="status-page__title">Ingen behörighet</h1>
      <p className="status-page__text">
        {EXPLANATIONS[permission]}
        {user && ` Du är inloggad som ${ROLE_LABELS[user.role]?.toLowerCase() ?? user.role}.`} Kontakta en
        administratör om du behöver en annan behörighet.
      </p>
      <Link to="/dashboard" className={buttonClass()}>
        <LuArrowLeft aria-hidden="true" />
        Till översikten
      </Link>
    </div>
  );
}
