import { Link, useNavigate } from '@tanstack/react-router';
import type { IconType } from 'react-icons';
import {
  LuArrowRight,
  LuChartColumn,
  LuCircleCheck,
  LuClock,
  LuLandmark,
  LuPlus,
  LuScrollText,
  LuStamp,
  LuUpload,
} from 'react-icons/lu';
import { useRecentAuditEntries } from '../../api/auditLog';
import { usePayments } from '../../api/payments';
import type { Account, PaymentSummary } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ActivityList } from '../../components/audit/ActivityList';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Money } from '../../components/ui/Money';
import { Skeleton, SkeletonRows } from '../../components/ui/Skeleton';
import { PaymentStatusBadge } from '../../components/ui/StatusBadge';
import { useNow } from '../../hooks/useNow';
import { formatDate, formatRelativeTime, formatTime } from '../../utils/date';
import { formatIban, maskIban } from '../../utils/iban';

function SectionLink({ to, children }: { to: '/accounts' | '/payments' | '/audit-log' | '/approvals'; children: string }) {
  return (
    <Link to={to} className="section-link">
      {children}
      <LuArrowRight aria-hidden="true" />
    </Link>
  );
}

// ---------------------------------------------------------------- Accounts

export function AccountsOverview({ accounts, loading }: { accounts: Account[] | undefined; loading: boolean }) {
  return (
    <Card>
      <CardHeader title="Konton" actions={<SectionLink to="/accounts">Visa alla</SectionLink>} />
      <div className="account-tiles">
        {loading
          ? [0, 1, 2].map((key) => (
              <div key={key} className="account-tile account-tile--loading" aria-hidden="true">
                <Skeleton width="50%" />
                <Skeleton width="35%" height={12} />
                <Skeleton width="70%" height={24} />
              </div>
            ))
          : accounts?.map((account) => (
              <Link
                key={account.id}
                to="/accounts/$accountId"
                params={{ accountId: account.id }}
                className="account-tile"
              >
                <span className="account-tile__head">
                  <span className="account-tile__icon">
                    <LuLandmark aria-hidden="true" />
                  </span>
                  <span className="account-tile__name">{account.accountName}</span>
                </span>
                <span className="account-tile__iban">{maskIban(account.iban)}</span>
                <span className="account-tile__balance">
                  <Money amount={account.balance} currency={account.currency} />
                </span>
                <span className="account-tile__available">
                  Tillgängligt <Money amount={account.availableBalance} currency={account.currency} />
                </span>
                {account.pendingPaymentCount > 0 && (
                  <Badge tone="warning" size="sm" className="account-tile__pending">
                    {account.pendingPaymentCount} väntar på attest
                  </Badge>
                )}
              </Link>
            ))}
        {!loading && accounts?.length === 0 && (
          <EmptyState compact icon={LuLandmark} title="Inga konton" description="Företaget har inga konton ännu." />
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Recent payments

export function RecentPayments({ payments, loading }: { payments: PaymentSummary[] | undefined; loading: boolean }) {
  const navigate = useNavigate();
  const rows = payments?.slice(0, 8);

  return (
    <Card>
      <CardHeader title="Senaste betalningar" actions={<SectionLink to="/payments">Visa alla</SectionLink>} />
      {!loading && rows?.length === 0 ? (
        <EmptyState compact title="Inga betalningar ännu" description="Betalningar som skapas i företaget visas här." />
      ) : (
        <div className="table-wrap" aria-busy={loading || undefined}>
          <table className="table table--clickable">
            <caption className="visually-hidden">De senaste betalningarna i företaget</caption>
            <thead>
              <tr>
                <th scope="col">Datum</th>
                <th scope="col">Betalning</th>
                <th scope="col" className="num">
                  Belopp
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows rows={6} columns={4} />
              ) : (
                rows?.map((payment) => (
                  <tr
                    key={payment.id}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('a, button')) return;
                      void navigate({ to: '/payments/$paymentId', params: { paymentId: payment.id } });
                    }}
                  >
                    <td className="nowrap">
                      <span className="cell-primary">{formatDate(payment.createdAt)}</span>
                      <span className="cell-secondary">{formatTime(payment.createdAt)}</span>
                    </td>
                    <td className="cell-reference">
                      <Link
                        to="/payments/$paymentId"
                        params={{ paymentId: payment.id }}
                        className="cell-link"
                        title={payment.reference || undefined}
                      >
                        {payment.reference || 'Utan referens'}
                      </Link>
                      <span className="cell-secondary" title={formatIban(payment.toIban)}>
                        Till {maskIban(payment.toIban)}
                      </span>
                    </td>
                    <td className="num nowrap">
                      <Money amount={payment.amount} currency={payment.currency} />
                    </td>
                    <td className="nowrap">
                      <PaymentStatusBadge status={payment.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Approval queue

function ListSkeleton() {
  return (
    <ul className="compact-list" aria-hidden="true">
      {[0, 1, 2].map((key) => (
        <li key={key} className="compact-list__item compact-list__item--loading">
          <div>
            <Skeleton width="60%" />
            <Skeleton width="40%" height={12} />
          </div>
          <Skeleton width={80} />
        </li>
      ))}
    </ul>
  );
}

/** Payments waiting on the current attestant (from the dashboard endpoint). */
export function ApprovalQueue({
  payments,
  count,
  loading,
}: {
  payments: PaymentSummary[] | undefined;
  count: number | undefined;
  loading: boolean;
}) {
  const now = useNow();
  const items = payments?.slice(0, 5) ?? [];

  return (
    <Card>
      <CardHeader
        title={
          <>
            Att attestera
            {!loading && count !== undefined && count > 0 && (
              <Badge tone="warning" size="sm" className="card__title-badge">
                {count}
              </Badge>
            )}
          </>
        }
        actions={<SectionLink to="/approvals">Gå till attestkorgen</SectionLink>}
      />
      {loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={LuCircleCheck}
          title="Inget att attestera"
          description="Du har inga betalningar som väntar på din attest."
        />
      ) : (
        <ul className="compact-list">
          {items.map((payment) => (
            <li key={payment.id}>
              <Link
                to="/payments/$paymentId"
                params={{ paymentId: payment.id }}
                className="compact-list__item compact-list__item--link"
              >
                <span className="compact-list__icon tone-warning">
                  <LuStamp aria-hidden="true" />
                </span>
                <span className="compact-list__body">
                  <span className="compact-list__title">{payment.reference || 'Utan referens'}</span>
                  <span className="compact-list__meta">
                    Till {maskIban(payment.toIban)} · {formatRelativeTime(payment.createdAt, now)}
                  </span>
                </span>
                <span className="compact-list__amount">
                  <Money amount={payment.amount} currency={payment.currency} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** For initiators: their own payments that are still waiting for attest. */
export function MyPendingPayments() {
  const now = useNow();
  const payments = usePayments({ status: 'pending_approval', createdByMe: true, page: 1, pageSize: 5 });
  const items = payments.data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Mina betalningar som väntar på attest"
        actions={
          <Link to="/payments" search={{ status: 'pending_approval', mine: true }} className="section-link">
            Visa alla
            <LuArrowRight aria-hidden="true" />
          </Link>
        }
      />
      {payments.isPending ? (
        <ListSkeleton />
      ) : payments.isError ? (
        <ErrorState compact error={payments.error} onRetry={() => void payments.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={LuCircleCheck}
          title="Inget väntar på attest"
          description="Dina betalningar har antingen genomförts eller hanterats."
        />
      ) : (
        <ul className="compact-list">
          {items.map((payment) => (
            <li key={payment.id}>
              <Link
                to="/payments/$paymentId"
                params={{ paymentId: payment.id }}
                className="compact-list__item compact-list__item--link"
              >
                <span className="compact-list__icon tone-warning">
                  <LuClock aria-hidden="true" />
                </span>
                <span className="compact-list__body">
                  <span className="compact-list__title">{payment.reference || 'Utan referens'}</span>
                  <span className="compact-list__meta">
                    {payment.approvalProgress
                      ? `Attest ${payment.approvalProgress.approved} av ${payment.approvalProgress.required}`
                      : 'Väntar på attest'}{' '}
                    · {formatRelativeTime(payment.createdAt, now)}
                  </span>
                </span>
                <span className="compact-list__amount">
                  <Money amount={payment.amount} currency={payment.currency} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Quick actions

interface QuickAction {
  to: '/payments/new' | '/payments/batch' | '/approvals' | '/reports';
  label: string;
  description: string;
  icon: IconType;
  tone: 'brand' | 'info' | 'warning' | 'neutral';
}

export function QuickActions({ pendingForMe }: { pendingForMe: number | undefined }) {
  const { canCreatePayments, canApprove } = useAuth();
  const actions: QuickAction[] = [];
  if (canCreatePayments) {
    actions.push(
      { to: '/payments/new', label: 'Ny betalning', description: 'Betala till ett IBAN', icon: LuPlus, tone: 'brand' },
      { to: '/payments/batch', label: 'Batchuppladdning', description: 'Många betalningar från en fil', icon: LuUpload, tone: 'info' },
    );
  }
  if (canApprove) {
    actions.push({
      to: '/approvals',
      label: 'Attestkorg',
      description: pendingForMe ? `${pendingForMe} väntar på dig` : 'Inget väntar på dig',
      icon: LuStamp,
      tone: 'warning',
    });
  }
  actions.push({ to: '/reports', label: 'Rapporter', description: 'Statistik och export', icon: LuChartColumn, tone: 'neutral' });

  return (
    <Card>
      <CardHeader title="Snabbval" />
      <div className="quick-actions">
        {actions.map(({ to, label, description, icon: Icon, tone }) => (
          <Link key={to} to={to} className="quick-action">
            <span className={`quick-action__icon tone-${tone}`}>
              <Icon aria-hidden="true" />
            </span>
            <span className="quick-action__text">
              <span className="quick-action__label">{label}</span>
              <span className="quick-action__description">{description}</span>
            </span>
            <LuArrowRight className="quick-action__arrow" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Activity

export function RecentActivity() {
  const now = useNow();
  const activity = useRecentAuditEntries(5);
  const entries = activity.data?.entries.slice(0, 5) ?? [];

  return (
    <Card>
      <CardHeader title="Senaste aktivitet" actions={<SectionLink to="/audit-log">Visa alla</SectionLink>} />
      <div className="card__body card__body--tight">
        {activity.isPending ? (
          <ListSkeleton />
        ) : activity.isError ? (
          <ErrorState compact error={activity.error} onRetry={() => void activity.refetch()} />
        ) : entries.length === 0 ? (
          <EmptyState compact icon={LuScrollText} title="Ingen aktivitet ännu" />
        ) : (
          <ActivityList entries={entries} now={now} />
        )}
      </div>
    </Card>
  );
}
