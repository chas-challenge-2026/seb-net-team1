import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { LuChartColumn, LuCircleCheck, LuCircleX, LuClock, LuDownload, LuSigma, LuUsers } from 'react-icons/lu';
import { getErrorMessage } from '../../api/client';
import { downloadPaymentsExport } from '../../api/payments';
import { useReportSummary } from '../../api/reports';
import type { PaymentStatus, ReportSummary, StatusBreakdown } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { IbanText } from '../../components/ui/IbanText';
import { Money } from '../../components/ui/Money';
import { PageHeader } from '../../components/ui/PageHeader';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatCard } from '../../components/ui/StatCard';
import { PaymentStatusBadge } from '../../components/ui/StatusBadge';
import { useToast } from '../../components/ui/toast/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useNow } from '../../hooks/useNow';
import { REPORT_PERIODS, type ReportPeriod } from '../../routes/searchSchemas';
import { cn } from '../../utils/cn';
import { firstDayOfMonth, formatMonthLong, toIsoDate } from '../../utils/date';
import { formatNumber, formatPercent, pluralize } from '../../utils/format';
import { PAYMENT_STATUS_TONES } from '../../utils/labels';
import { centsToMoney, formatMoney, moneyToCents } from '../../utils/money';
import { MonthlyChart } from './MonthlyChart';
import '../../styles/pages/reports.css';

const routeApi = getRouteApi('/app/reports');

const PERIOD_OPTIONS = REPORT_PERIODS.map((months) => ({ value: months, label: `${months} månader` }));
const STATUS_ORDER: PaymentStatus[] = ['completed', 'pending_approval', 'rejected'];

function statusRow(report: ReportSummary | undefined, status: PaymentStatus): StatusBreakdown {
  return report?.byStatus.find((row) => row.status === status) ?? { status, count: 0, amount: '0.00' };
}

export function ReportsPage() {
  useDocumentTitle('Rapporter');
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const toast = useToast();
  const now = useNow();
  const [exporting, setExporting] = useState(false);
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const months: ReportPeriod = search.months ?? 6;
  const report = useReportSummary(months);
  const data = report.data;
  const loading = report.isPending;

  const completedCents = data?.months.reduce((sum, month) => sum + moneyToCents(month.completedAmount), 0) ?? 0;
  const completedCount = data?.months.reduce((sum, month) => sum + month.completedCount, 0) ?? 0;
  const averageCents = data && data.months.length > 0 ? Math.round(completedCents / data.months.length) : 0;
  const pending = statusRow(data, 'pending_approval');
  const rejected = statusRow(data, 'rejected');

  function periodStart(): string {
    const fromReport = data?.months[0] ? firstDayOfMonth(data.months[0].month) : undefined;
    if (fromReport) return fromReport;
    const today = new Date(now);
    return toIsoDate(new Date(today.getFullYear(), today.getMonth() - (months - 1), 1));
  }

  async function handleExport() {
    setExporting(true);
    try {
      await downloadPaymentsExport({ fromDate: periodStart() });
      toast.success('Exporten har laddats ner.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Exporten kunde inte skapas. Försök igen.'));
    } finally {
      setExporting(false);
    }
  }

  const periodLabel = data?.months.length
    ? `${formatMonthLong(data.months[0].month)} – ${formatMonthLong(data.months[data.months.length - 1].month)}`
    : `De senaste ${months} månaderna`;

  return (
    <div className="page">
      <PageHeader
        title="Rapporter"
        description="Statistik över företagets betalningar per månad, status och mottagare."
        actions={
          <Button variant="secondary" icon={LuDownload} onClick={() => void handleExport()} loading={exporting}>
            Exportera betalningar (CSV)
          </Button>
        }
      />

      <div className="report-toolbar">
        <SegmentedControl<ReportPeriod>
          label="Period"
          value={months}
          onChange={(next) => void navigate({ search: { months: next === 6 ? undefined : next } })}
          options={PERIOD_OPTIONS}
        />
        <p className="report-toolbar__period" aria-live="polite">
          {periodLabel}
        </p>
      </div>

      {report.isError ? (
        <Card>
          <ErrorState
            error={report.error}
            title="Rapporten kunde inte hämtas"
            onRetry={() => void report.refetch()}
            retrying={report.isFetching}
          />
        </Card>
      ) : (
        <>
          <section className={cn('stat-grid', report.isPlaceholderData && 'is-refetching')} aria-label="Nyckeltal för perioden">
            <StatCard
              label="Genomfört belopp"
              icon={LuCircleCheck}
              tone="success"
              loading={loading}
              value={<Money amount={centsToMoney(completedCents)} />}
              meta={pluralize(completedCount, 'genomförd betalning', 'genomförda betalningar')}
            />
            <StatCard
              label="Snitt per månad"
              icon={LuSigma}
              loading={loading}
              value={<Money amount={centsToMoney(averageCents)} />}
              meta="Genomfört belopp per månad"
            />
            <StatCard
              label="Väntar på attest"
              icon={LuClock}
              tone="warning"
              loading={loading}
              value={<Money amount={pending.amount} />}
              meta={pluralize(pending.count, 'betalning', 'betalningar')}
            />
            <StatCard
              label="Avvisade"
              icon={LuCircleX}
              tone="danger"
              loading={loading}
              value={<Money amount={rejected.amount} />}
              meta={pluralize(rejected.count, 'betalning', 'betalningar')}
            />
          </section>

          <Card>
            <CardHeader
              title="Genomfört belopp per månad"
              description="Håll muspekaren över eller fokusera en stapel för att se alla värden för månaden."
              actions={
                <SegmentedControl
                  label="Visa som"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'chart', label: 'Diagram' },
                    { value: 'table', label: 'Tabell' },
                  ]}
                />
              }
            />
            <CardBody>
              {loading ? (
                <Skeleton width="100%" height={280} />
              ) : !data || data.months.length === 0 ? (
                <EmptyState compact icon={LuChartColumn} title="Ingen data för perioden" />
              ) : view === 'chart' ? (
                <>
                  <MonthlyChart months={data.months} refetching={report.isPlaceholderData} />
                  {completedCents === 0 && (
                    <p className="chart__empty-note">Inga betalningar genomfördes under perioden.</p>
                  )}
                </>
              ) : (
                <MonthlyTable report={data} />
              )}
            </CardBody>
          </Card>

          <div className="report-grid">
            <Card>
              <CardHeader title="Fördelning per status" description="Alla betalningar som skapades under perioden." />
              <CardBody>
                {loading ? (
                  <Skeleton width="100%" height={120} />
                ) : (
                  <StatusBreakdownList report={data} />
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Största mottagare" description="De fem mottagarna med störst belopp under perioden." />
              {loading ? (
                <CardBody>
                  <Skeleton width="100%" height={120} />
                </CardBody>
              ) : !data || data.topRecipients.length === 0 ? (
                <EmptyState compact icon={LuUsers} title="Inga mottagare under perioden" />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <caption className="visually-hidden">De fem största mottagarna</caption>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Mottagare</th>
                        <th scope="col" className="num">
                          Antal
                        </th>
                        <th scope="col" className="num">
                          Belopp
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topRecipients.map((recipient, index) => (
                        <tr key={recipient.toIban}>
                          <td className="text-muted">{index + 1}</td>
                          <td className="nowrap">
                            <IbanText iban={recipient.toIban} />
                          </td>
                          <td className="num">{formatNumber(recipient.count)}</td>
                          <td className="num nowrap">
                            <Money amount={recipient.amount} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBreakdownList({ report }: { report: ReportSummary | undefined }) {
  const rows = STATUS_ORDER.map((status) => statusRow(report, status));
  const totalCents = rows.reduce((sum, row) => sum + moneyToCents(row.amount), 0);
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);

  if (totalCount === 0) {
    return <EmptyState compact icon={LuChartColumn} title="Inga betalningar under perioden" />;
  }

  return (
    <ul className="status-breakdown">
      {rows.map((row) => {
        const share = totalCents > 0 ? moneyToCents(row.amount) / totalCents : 0;
        return (
          <li key={row.status} className="status-breakdown__row">
            <div className="status-breakdown__head">
              <PaymentStatusBadge status={row.status} />
              <span className="status-breakdown__count">{pluralize(row.count, 'betalning', 'betalningar')}</span>
              <span className="status-breakdown__amount">
                <Money amount={row.amount} />
              </span>
            </div>
            <div className="status-breakdown__meter">
              <span
                className={`status-breakdown__track tone-${PAYMENT_STATUS_TONES[row.status]}`}
                role="img"
                aria-label={`${formatPercent(share)} av beloppet`}
              >
                <span className="status-breakdown__fill" style={{ width: `${share * 100}%` }} />
              </span>
              <span className="status-breakdown__share">{formatPercent(share)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MonthlyTable({ report }: { report: ReportSummary }) {
  return (
    <div className="table-wrap">
      <table className="table table--wide">
        <caption className="visually-hidden">Belopp och antal per månad</caption>
        <thead>
          <tr>
            <th scope="col">Månad</th>
            <th scope="col" className="num">
              Genomförda
            </th>
            <th scope="col" className="num">
              Genomfört belopp
            </th>
            <th scope="col" className="num">
              Väntar
            </th>
            <th scope="col" className="num">
              Avvisade
            </th>
            <th scope="col" className="num">
              Avvisat belopp
            </th>
          </tr>
        </thead>
        <tbody>
          {report.months.map((month) => (
            <tr key={month.month}>
              <td className="nowrap capitalize">{formatMonthLong(month.month)}</td>
              <td className="num">{formatNumber(month.completedCount)}</td>
              <td className="num nowrap">{formatMoney(month.completedAmount)}</td>
              <td className="num">{formatNumber(month.pendingCount)}</td>
              <td className="num">{formatNumber(month.rejectedCount)}</td>
              <td className="num nowrap">{formatMoney(month.rejectedAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
