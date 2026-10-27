import { Link, getRouteApi } from '@tanstack/react-router';
import { LuFilterX, LuScrollText, LuShieldAlert, LuShieldCheck } from 'react-icons/lu';
import { useAuditLog, useVerifyAuditChain } from '../../api/auditLog';
import { getErrorMessage } from '../../api/client';
import type { AuditAction, AuditEntry, AuditVerification } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Select } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { AuditActionBadge } from '../../components/ui/StatusBadge';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDate, formatDateTime, formatTime } from '../../utils/date';
import { formatNumber } from '../../utils/format';
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, entityTypeLabel } from '../../utils/labels';

const routeApi = getRouteApi('/app/audit-log');
const PAGE_LIMIT = 50;

function toAuditAction(value: string): AuditAction | undefined {
  return (AUDIT_ACTIONS as readonly string[]).includes(value) ? (value as AuditAction) : undefined;
}

export function AuditLogPage() {
  useDocumentTitle('Granskningslogg');
  const search = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const { isAdmin } = useAuth();
  const log = useAuditLog({ action: search.action, limit: PAGE_LIMIT });
  const verify = useVerifyAuditChain();

  const entries = log.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <div className="page">
      <PageHeader
        title="Granskningslogg"
        description="Alla händelser i företaget, de senaste först. Varje post är signerad och kedjad till posten före, så att ändringar i efterhand upptäcks."
        actions={
          isAdmin && (
            <Button
              variant="secondary"
              icon={LuShieldCheck}
              onClick={() => verify.mutate()}
              loading={verify.isPending}
            >
              Verifiera loggkedjan
            </Button>
          )
        }
      />

      {verify.data && <VerificationResult result={verify.data} onDismiss={() => verify.reset()} />}
      {verify.isError && (
        <Alert
          tone="danger"
          title="Verifieringen kunde inte genomföras"
          onDismiss={() => verify.reset()}
          className="page-alert"
        >
          {getErrorMessage(verify.error)}
        </Alert>
      )}

      <Card>
        <div className="filter-bar">
          <Select
            label="Händelse"
            containerClassName="filter-bar__action"
            value={search.action ?? ''}
            onChange={(event) => void navigate({ search: { action: toAuditAction(event.target.value) } })}
          >
            <option value="">Alla händelser</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {AUDIT_ACTION_LABELS[action]}
              </option>
            ))}
          </Select>
          {search.action && (
            <Button
              variant="ghost"
              size="sm"
              icon={LuFilterX}
              onClick={() => void navigate({ search: {} })}
              className="filter-bar__clear"
            >
              Rensa filter
            </Button>
          )}
        </div>

        {log.isError ? (
          <ErrorState
            error={log.error}
            title="Granskningsloggen kunde inte hämtas"
            onRetry={() => void log.refetch()}
            retrying={log.isFetching}
          />
        ) : !log.isPending && entries.length === 0 ? (
          <EmptyState
            icon={LuScrollText}
            title={search.action ? 'Inga händelser av den typen' : 'Inga händelser ännu'}
            description={search.action ? 'Välj en annan händelse eller rensa filtret.' : undefined}
          />
        ) : (
          <>
            <div className="table-wrap" aria-busy={log.isPending || undefined}>
              <table className="table table--wide audit-table">
                <caption className="visually-hidden">Granskningslogg, de senaste händelserna först</caption>
                <thead>
                  <tr>
                    <th scope="col">Tidpunkt</th>
                    <th scope="col">Användare</th>
                    <th scope="col">Händelse</th>
                    <th scope="col">Beskrivning</th>
                    <th scope="col">Objekt</th>
                  </tr>
                </thead>
                <tbody>
                  {log.isPending ? (
                    <SkeletonRows rows={10} columns={5} />
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="nowrap">
                          <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
                            <span className="cell-primary">{formatDate(entry.createdAt)}</span>
                            <span className="cell-secondary">{formatTime(entry.createdAt)}</span>
                          </time>
                        </td>
                        <td className="nowrap">{entry.userName ?? <span className="text-muted">Systemet</span>}</td>
                        <td className="nowrap">
                          <AuditActionBadge action={entry.action} />
                        </td>
                        <td className="cell-wrap">{entry.description}</td>
                        <td className="nowrap">
                          <EntityCell entry={entry} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!log.isPending && (
              <div className="load-more">
                {log.hasNextPage ? (
                  <Button variant="secondary" onClick={() => void log.fetchNextPage()} loading={log.isFetchingNextPage}>
                    Visa fler
                  </Button>
                ) : (
                  <p className="load-more__end">Alla {formatNumber(entries.length)} händelser visas.</p>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function EntityCell({ entry }: { entry: AuditEntry }) {
  if (entry.entityType === 'payment' && entry.entityId !== null) {
    return (
      <Link to="/payments/$paymentId" params={{ paymentId: entry.entityId }} className="cell-link">
        Betalning #{entry.entityId}
      </Link>
    );
  }
  if (!entry.entityType) return <span className="text-subtle">–</span>;
  return (
    <span className="text-muted">
      {entityTypeLabel(entry.entityType)}
      {entry.entityId !== null && ` #${entry.entityId}`}
    </span>
  );
}

function VerificationResult({ result, onDismiss }: { result: AuditVerification; onDismiss: () => void }) {
  if (result.valid) {
    return (
      <Alert
        tone="success"
        icon={LuShieldCheck}
        className="page-alert"
        title={`Kedjan är intakt, ${formatNumber(result.checkedCount)} poster verifierade`}
        onDismiss={onDismiss}
        live
      >
        Ingen post har ändrats eller tagits bort. Verifierad {formatDateTime(result.verifiedAt)}.
      </Alert>
    );
  }
  return (
    <Alert tone="danger" icon={LuShieldAlert} className="page-alert" title="Kedjan är bruten" onDismiss={onDismiss}>
      {result.firstInvalidEntryId !== null
        ? `Första ogiltiga post är #${result.firstInvalidEntryId}. `
        : ''}
      Loggen kan ha ändrats efter att posterna skrevs. {formatNumber(result.checkedCount)} poster kontrollerades{' '}
      {formatDateTime(result.verifiedAt)}. Kontakta er säkerhetsansvarige.
    </Alert>
  );
}
