import { Link, getRouteApi, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { LuCheck, LuCircleCheck, LuHistory, LuUsers, LuX } from 'react-icons/lu';
import { useApprovals } from '../../api/approvals';
import type { ApprovalAction, HandledApproval, PendingApproval } from '../../api/types';
import { RoleGate } from '../../auth/RoleGate';
import { DecisionDialog, type DecisionTarget } from '../../components/payments/DecisionDialog';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { buttonClass } from '../../components/ui/buttonClass';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { IbanText } from '../../components/ui/IbanText';
import { Money } from '../../components/ui/Money';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton, SkeletonRows } from '../../components/ui/Skeleton';
import { ApprovalStepBadge } from '../../components/ui/StatusBadge';
import { TabPanel, Tabs } from '../../components/ui/Tabs';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { formatDate, formatDateTime, formatRelativeTime, formatTime } from '../../utils/date';
import '../../styles/pages/approvals.css';

const routeApi = getRouteApi('/app/approvals');

type ApprovalsTab = 'pending' | 'handled';

export function ApprovalsPage() {
  return (
    <RoleGate permission="approve">
      <ApprovalsView />
    </RoleGate>
  );
}

function toTarget(item: PendingApproval, action: ApprovalAction): DecisionTarget {
  return {
    approvalStepId: item.approvalStepId,
    paymentId: item.paymentId,
    action,
    amount: item.amount,
    currency: item.currency,
    reference: item.reference,
    toIban: item.toIban,
    fromAccountName: item.fromAccountName,
    createdByName: item.createdByName,
    stepNumber: item.currentStep,
    totalSteps: item.totalSteps,
  };
}

function ApprovalsView() {
  useDocumentTitle('Attestkorg');
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const approvals = useApprovals();
  const [target, setTarget] = useState<DecisionTarget | null>(null);

  const tab: ApprovalsTab = search.tab ?? 'pending';
  const pending = approvals.data?.pending ?? [];
  const handled = approvals.data?.recentlyHandled ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Attestkorg"
        description="Betalningar som väntar på ditt godkännande. Du kan aldrig attestera dina egna betalningar."
      />

      <Card>
        <div className="list-toolbar">
          <Tabs<ApprovalsTab>
            idPrefix="approvals"
            label="Attestkorgens flikar"
            value={tab}
            onChange={(next) => void navigate({ search: { tab: next === 'pending' ? undefined : next } })}
            items={[
              { id: 'pending', label: 'Att attestera', count: approvals.data ? pending.length : undefined },
              { id: 'handled', label: 'Hanterade' },
            ]}
          />
        </div>

        <TabPanel idPrefix="approvals" tab={tab}>
          {approvals.isError ? (
            <ErrorState
              error={approvals.error}
              title="Attestkorgen kunde inte hämtas"
              onRetry={() => void approvals.refetch()}
              retrying={approvals.isFetching}
            />
          ) : tab === 'pending' ? (
            <PendingList items={pending} loading={approvals.isPending} onDecide={(item, action) => setTarget(toTarget(item, action))} />
          ) : (
            <HandledTable items={handled} loading={approvals.isPending} />
          )}
        </TabPanel>
      </Card>

      {target && <DecisionDialog target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function PendingList({
  items,
  loading,
  onDecide,
}: {
  items: PendingApproval[];
  loading: boolean;
  onDecide: (item: PendingApproval, action: ApprovalAction) => void;
}) {
  const now = useNow();

  if (loading) {
    return (
      <ul className="approval-list" aria-busy="true">
        {[0, 1, 2].map((key) => (
          <li key={key} className="approval-item" aria-hidden="true">
            <div className="approval-item__main">
              <Skeleton width="40%" height={16} />
              <Skeleton width="70%" />
              <Skeleton width="55%" />
            </div>
            <div className="approval-item__side">
              <Skeleton width={140} height={24} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={LuCircleCheck}
        title="Inga betalningar att attestera"
        description="När en betalning behöver ditt godkännande dyker den upp här. Du får också en notis."
      />
    );
  }

  return (
    <ul className="approval-list">
      {items.map((item) => (
        <li key={item.approvalStepId} className="approval-item">
          <div className="approval-item__main">
            <div className="approval-item__heading">
              <Link to="/payments/$paymentId" params={{ paymentId: item.paymentId }} className="approval-item__title">
                {item.reference || 'Utan referens'}
              </Link>
              <div className="approval-item__badges">
                <Badge tone="warning" size="sm">
                  Steg {item.currentStep} av {item.totalSteps}
                </Badge>
                {item.requiresDoubleApproval && (
                  <Badge tone="info" size="sm" icon={LuUsers}>
                    Dubbel attest
                  </Badge>
                )}
              </div>
            </div>
            <dl className="approval-item__facts">
              <div>
                <dt>Mottagare</dt>
                <dd>
                  <IbanText iban={item.toIban} />
                </dd>
              </div>
              <div>
                <dt>Från konto</dt>
                <dd>{item.fromAccountName}</dd>
              </div>
              <div>
                <dt>Skapad av</dt>
                <dd>{item.createdByName}</dd>
              </div>
              <div>
                <dt>Skapad</dt>
                <dd>
                  <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)}>
                    {formatRelativeTime(item.createdAt, now)}
                  </time>
                </dd>
              </div>
            </dl>
          </div>
          <div className="approval-item__side">
            <Money amount={item.amount} currency={item.currency} className="approval-item__amount" />
            <div className="approval-item__actions">
              <Link
                to="/payments/$paymentId"
                params={{ paymentId: item.paymentId }}
                className={buttonClass({ variant: 'ghost', size: 'sm' })}
              >
                Visa detaljer
              </Link>
              <Button variant="danger-secondary" size="sm" icon={LuX} onClick={() => onDecide(item, 'reject')}>
                Avvisa
              </Button>
              <Button size="sm" icon={LuCheck} onClick={() => onDecide(item, 'approve')}>
                Godkänn
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function HandledTable({ items, loading }: { items: HandledApproval[]; loading: boolean }) {
  const navigate = useNavigate();

  if (!loading && items.length === 0) {
    return (
      <EmptyState
        icon={LuHistory}
        title="Inga hanterade attester ännu"
        description="Betalningar som du har godkänt eller avvisat visas här."
      />
    );
  }

  return (
    <div className="table-wrap" aria-busy={loading || undefined}>
      <table className="table table--wide table--clickable">
        <caption className="visually-hidden">Attester som du har hanterat</caption>
        <thead>
          <tr>
            <th scope="col">Beslutad</th>
            <th scope="col">Referens</th>
            <th scope="col">Mottagare</th>
            <th scope="col" className="num">
              Belopp
            </th>
            <th scope="col">Beslut</th>
            <th scope="col">Kommentar</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows rows={5} columns={6} />
          ) : (
            items.map((item) => (
              <tr
                key={item.approvalStepId}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a, button')) return;
                  void navigate({ to: '/payments/$paymentId', params: { paymentId: item.paymentId } });
                }}
              >
                <td className="nowrap">
                  <span className="cell-primary">{formatDate(item.decidedAt)}</span>
                  <span className="cell-secondary">{formatTime(item.decidedAt)}</span>
                </td>
                <td className="cell-reference">
                  <Link
                    to="/payments/$paymentId"
                    params={{ paymentId: item.paymentId }}
                    className="cell-link"
                    title={item.reference || undefined}
                  >
                    {item.reference || 'Utan referens'}
                  </Link>
                  <span className="cell-secondary">#{item.paymentId}</span>
                </td>
                <td className="nowrap">
                  <IbanText iban={item.toIban} />
                </td>
                <td className="num nowrap">
                  <Money amount={item.amount} currency={item.currency} />
                </td>
                <td className="nowrap">
                  <ApprovalStepBadge status={item.status} />
                  <span className="cell-secondary">Steg {item.stepNumber}</span>
                </td>
                <td className="cell-wrap cell-comment">{item.comment || <span className="text-subtle">–</span>}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
