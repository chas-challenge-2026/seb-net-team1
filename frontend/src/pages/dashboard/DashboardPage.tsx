import { Link } from '@tanstack/react-router';
import { LuArrowRight, LuBanknote, LuCircleCheck, LuClock, LuPlus, LuStamp, LuUpload, LuWallet } from 'react-icons/lu';
import { useDashboard } from '../../api/dashboard';
import { useAuth, useCurrentUser } from '../../auth/AuthContext';
import { buttonClass } from '../../components/ui/buttonClass';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { Money } from '../../components/ui/Money';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { formatLongDate, greetingFor } from '../../utils/date';
import { firstName, pluralize } from '../../utils/format';
import { subtractMoney } from '../../utils/money';
import {
  AccountsOverview,
  ApprovalQueue,
  MyPendingPayments,
  QuickActions,
  RecentActivity,
  RecentPayments,
} from './DashboardWidgets';
import '../../styles/pages/dashboard.css';

export function DashboardPage() {
  useDocumentTitle('Översikt');
  const user = useCurrentUser();
  const { canApprove, canCreatePayments } = useAuth();
  const dashboard = useDashboard();
  const now = useNow();

  const data = dashboard.data;
  const stats = data?.stats;
  const loading = dashboard.isPending;
  const reserved = stats ? subtractMoney(stats.totalBalance, stats.availableBalance) : undefined;

  return (
    <div className="page">
      <PageHeader
        title={`${greetingFor(new Date(now))}, ${firstName(user.name)}`}
        description={`${data?.tenantName ?? user.tenantName} · ${formatLongDate(now)}`}
        actions={
          canCreatePayments && (
            <>
              <Link to="/payments/batch" className={buttonClass({ variant: 'secondary' })}>
                <LuUpload aria-hidden="true" />
                Batchuppladdning
              </Link>
              <Link to="/payments/new" className={buttonClass()}>
                <LuPlus aria-hidden="true" />
                Ny betalning
              </Link>
            </>
          )
        }
      />

      {dashboard.isError ? (
        <Card>
          <ErrorState
            error={dashboard.error}
            title="Översikten kunde inte hämtas"
            onRetry={() => void dashboard.refetch()}
            retrying={dashboard.isFetching}
          />
        </Card>
      ) : (
        <>
          <section className="stat-grid" aria-label="Nyckeltal">
            <StatCard
              label="Totalt saldo"
              icon={LuWallet}
              loading={loading}
              value={<Money amount={stats?.totalBalance} />}
              meta={data && `Summa för ${pluralize(data.accounts.length, 'konto', 'konton')}`}
            />
            <StatCard
              label="Tillgängligt saldo"
              icon={LuBanknote}
              tone="info"
              loading={loading}
              value={<Money amount={stats?.availableBalance} />}
              meta={
                reserved !== undefined && (
                  <>
                    <Money amount={reserved} /> reserverat för väntande betalningar
                  </>
                )
              }
            />
            {canApprove ? (
              <StatCard
                label="Att attestera"
                icon={LuStamp}
                tone="warning"
                loading={loading}
                value={stats?.myPendingApprovalCount ?? 0}
                meta={stats && `${pluralize(stats.pendingApprovalCount, 'betalning', 'betalningar')} väntar i företaget`}
                action={
                  <Link to="/approvals" className="section-link">
                    Till attestkorgen
                    <LuArrowRight aria-hidden="true" />
                  </Link>
                }
              />
            ) : (
              <StatCard
                label="Väntar på attest"
                icon={LuClock}
                tone="warning"
                loading={loading}
                value={stats?.pendingApprovalCount ?? 0}
                meta="Betalningar i företaget"
                action={
                  <Link to="/payments" search={{ status: 'pending_approval' }} className="section-link">
                    Visa betalningar
                    <LuArrowRight aria-hidden="true" />
                  </Link>
                }
              />
            )}
            <StatCard
              label="Genomförda denna månad"
              icon={LuCircleCheck}
              tone="success"
              loading={loading}
              value={<Money amount={stats?.completedThisMonthAmount} />}
              meta={
                stats &&
                `${pluralize(stats.completedThisMonthCount, 'betalning', 'betalningar')}${
                  stats.rejectedThisMonthCount > 0 ? ` · ${stats.rejectedThisMonthCount} avvisade` : ''
                }`
              }
            />
          </section>

          <div className="dashboard-grid">
            <div className="dashboard-grid__main">
              <AccountsOverview accounts={data?.accounts} loading={loading} />
              <RecentPayments payments={data?.recentPayments} loading={loading} />
            </div>
            <div className="dashboard-grid__side">
              {canApprove ? (
                <ApprovalQueue
                  payments={data?.pendingApprovals}
                  count={stats?.myPendingApprovalCount}
                  loading={loading}
                />
              ) : (
                <MyPendingPayments />
              )}
              <QuickActions pendingForMe={stats?.myPendingApprovalCount} />
              <RecentActivity />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
