import { Link, useNavigate } from '@tanstack/react-router';
import type { MouseEvent, ReactNode } from 'react';
import type { PaymentListItem } from '../../api/types';
import { cn } from '../../utils/cn';
import { formatDate, formatTime } from '../../utils/date';
import { Badge } from '../ui/Badge';
import { IbanText } from '../ui/IbanText';
import { Money } from '../ui/Money';
import { SkeletonRows } from '../ui/Skeleton';
import { PaymentStatusBadge } from '../ui/StatusBadge';
import { ApprovalProgressText } from './ApprovalProgressText';

interface PaymentsTableProps {
  payments: PaymentListItem[] | undefined;
  /** First load: shows skeleton rows. */
  loading: boolean;
  /** Loading another page or filter: dims the current rows. */
  refetching?: boolean;
  /** Hide the "Från konto" column, e.g. on an account's own page. */
  showAccount?: boolean;
  skeletonRows?: number;
  /** Visually hidden table caption. */
  caption: string;
  /** Rendered instead of the table when there are no payments. */
  empty: ReactNode;
}

/** Clicks on links, buttons and text selections inside a row should not open the payment. */
function shouldIgnoreRowClick(event: MouseEvent<HTMLTableRowElement>) {
  const target = event.target as HTMLElement;
  if (target.closest('a, button, input, select, textarea, label')) return true;
  return Boolean(window.getSelection()?.toString());
}

export function PaymentsTable({
  payments,
  loading,
  refetching = false,
  showAccount = true,
  skeletonRows = 8,
  caption,
  empty,
}: PaymentsTableProps) {
  const navigate = useNavigate();

  if (!loading && payments && payments.length === 0) return <>{empty}</>;

  return (
    <div className={cn('table-wrap', refetching && 'is-refetching')} aria-busy={loading || refetching || undefined}>
      <table className="table table--clickable table--wide">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Datum</th>
            <th scope="col">Referens</th>
            <th scope="col">Mottagare</th>
            {showAccount && <th scope="col">Från konto</th>}
            <th scope="col" className="num">
              Belopp
            </th>
            <th scope="col">Status</th>
            <th scope="col" className="center">
              Attest
            </th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows rows={skeletonRows} columns={showAccount ? 7 : 6} />
          ) : (
            payments?.map((payment) => (
              <tr
                key={payment.id}
                onClick={(event) => {
                  if (shouldIgnoreRowClick(event)) return;
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
                  <span className="cell-secondary">
                    #{payment.id}
                    {payment.source === 'batch' && (
                      <Badge tone="neutral" size="sm" className="cell-badge">
                        Batch
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="nowrap">
                  <IbanText iban={payment.toIban} />
                </td>
                {showAccount && <td className="nowrap">{payment.fromAccountName}</td>}
                <td className="num nowrap">
                  <Money amount={payment.amount} currency={payment.currency} />
                </td>
                <td className="nowrap">
                  <PaymentStatusBadge status={payment.status} />
                </td>
                <td className="center">
                  <ApprovalProgressText progress={payment.approvalProgress} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
