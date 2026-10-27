import { Link, useRouterState } from '@tanstack/react-router';
import type { RefObject } from 'react';
import {
  LuArrowLeftRight,
  LuChartColumn,
  LuLandmark,
  LuLayoutDashboard,
  LuLogOut,
  LuPlus,
  LuScrollText,
  LuSettings,
  LuStamp,
  LuUpload,
  LuX,
} from 'react-icons/lu';
import { useApprovals } from '../../api/approvals';
import logo from '../../assets/seb_logo_white.png';
import { useAuth } from '../../auth/AuthContext';
import { cn } from '../../utils/cn';
import { ROLE_LABELS } from '../../utils/labels';
import { Avatar } from '../ui/Avatar';

const ACTIVE_PROPS = { className: 'is-active' };

interface SidebarProps {
  /** Only relevant below 1024px, where the sidebar is an off-canvas drawer. */
  open: boolean;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement>;
}

export function Sidebar({ open, onClose, closeButtonRef }: SidebarProps) {
  const { user, canCreatePayments, canApprove, logout } = useAuth();
  const approvals = useApprovals({ enabled: canApprove, refetchInterval: 60_000 });
  const pendingCount = approvals.data?.pending.length ?? 0;
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // "Betalningar" also stays highlighted on a payment's detail page.
  const onPaymentDetail = /^\/payments\/\d+/.test(pathname);

  if (!user) return null;

  return (
    <aside id="app-sidebar" className={cn('sidebar', open && 'is-open')} aria-label="Sidomeny">
      <div className="sidebar__brand">
        <Link to="/dashboard" className="sidebar__logo" aria-label="SEB Företagsbetalningar, till översikten">
          <img src={logo} alt="" width={64} height={28} />
        </Link>
        <span className="sidebar__product">Företagsbetalningar</span>
        <button ref={closeButtonRef} type="button" className="sidebar__close" onClick={onClose} aria-label="Stäng menyn">
          <LuX aria-hidden="true" />
        </button>
      </div>

      <nav className="sidebar__nav" aria-label="Huvudnavigering">
        <ul className="sidebar__list">
          <li>
            <Link to="/dashboard" className="sidebar__link" activeProps={ACTIVE_PROPS}>
              <LuLayoutDashboard aria-hidden="true" />
              <span>Översikt</span>
            </Link>
          </li>
        </ul>

        <p className="sidebar__group-label" id="sidebar-payments-label">
          Betalningar
        </p>
        <ul className="sidebar__list" aria-labelledby="sidebar-payments-label">
          <li>
            <Link
              to="/payments"
              className={cn('sidebar__link', onPaymentDetail && 'is-active')}
              activeOptions={{ exact: true, includeSearch: false }}
              activeProps={ACTIVE_PROPS}
            >
              <LuArrowLeftRight aria-hidden="true" />
              <span>Betalningar</span>
            </Link>
          </li>
          {canCreatePayments && (
            <>
              <li>
                <Link to="/payments/new" className="sidebar__link" activeProps={ACTIVE_PROPS}>
                  <LuPlus aria-hidden="true" />
                  <span>Ny betalning</span>
                </Link>
              </li>
              <li>
                <Link to="/payments/batch" className="sidebar__link" activeProps={ACTIVE_PROPS}>
                  <LuUpload aria-hidden="true" />
                  <span>Batchuppladdning</span>
                </Link>
              </li>
            </>
          )}
        </ul>

        <div className="sidebar__divider" role="presentation" />
        <ul className="sidebar__list">
          {canApprove && (
            <li>
              <Link to="/approvals" className="sidebar__link" activeProps={ACTIVE_PROPS}>
                <LuStamp aria-hidden="true" />
                <span>Attestkorg</span>
                {pendingCount > 0 && (
                  <span className="sidebar__badge">
                    <span aria-hidden="true">{pendingCount > 99 ? '99+' : pendingCount}</span>
                    <span className="visually-hidden">, {pendingCount} väntar på din attest</span>
                  </span>
                )}
              </Link>
            </li>
          )}
          <li>
            <Link to="/accounts" className="sidebar__link" activeProps={ACTIVE_PROPS}>
              <LuLandmark aria-hidden="true" />
              <span>Konton</span>
            </Link>
          </li>
          <li>
            <Link to="/audit-log" className="sidebar__link" activeProps={ACTIVE_PROPS}>
              <LuScrollText aria-hidden="true" />
              <span>Granskningslogg</span>
            </Link>
          </li>
          <li>
            <Link to="/reports" className="sidebar__link" activeProps={ACTIVE_PROPS}>
              <LuChartColumn aria-hidden="true" />
              <span>Rapporter</span>
            </Link>
          </li>
        </ul>

        <ul className="sidebar__list sidebar__list--bottom">
          <li>
            <Link to="/settings" className="sidebar__link" activeProps={ACTIVE_PROPS}>
              <LuSettings aria-hidden="true" />
              <span>Inställningar</span>
            </Link>
          </li>
        </ul>
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__user">
          <Avatar name={user.name} />
          <div className="sidebar__user-text">
            <p className="sidebar__user-name">{user.name}</p>
            <p className="sidebar__user-meta">{user.tenantName}</p>
            <p className="sidebar__user-role">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
        </div>
        <button type="button" className="sidebar__logout" onClick={() => void logout()} aria-label="Logga ut" title="Logga ut">
          <LuLogOut aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
