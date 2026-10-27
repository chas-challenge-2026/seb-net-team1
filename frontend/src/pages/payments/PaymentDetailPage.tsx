import { Link, getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { LuArrowLeft, LuCheck, LuScrollText, LuSearchX, LuStamp, LuX } from 'react-icons/lu';
import { isApiError } from '../../api/client';
import { usePayment } from '../../api/payments';
import type { ApprovalAction, PaymentDetail } from '../../api/types';
import { ActivityList } from '../../components/audit/ActivityList';
import { ApprovalProgressText } from '../../components/payments/ApprovalProgressText';
import { ApprovalTimeline } from '../../components/payments/ApprovalTimeline';
import { DecisionDialog } from '../../components/payments/DecisionDialog';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { buttonClass } from '../../components/ui/buttonClass';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { DescriptionList } from '../../components/ui/DescriptionList';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { IbanText } from '../../components/ui/IbanText';
import { Money } from '../../components/ui/Money';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { PaymentStatusBadge } from '../../components/ui/StatusBadge';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../utils/date';
import { PAYMENT_SOURCE_LABELS } from '../../utils/labels';
import '../../styles/pages/payments.css';

const routeApi = getRouteApi('/app/payments/$paymentId');

function BackLink() {
  return (
    <Link to="/payments" className="back-link">
      <LuArrowLeft aria-hidden="true" />
      Betalningar
    </Link>
  );
}

function totalStepsFor(payment: PaymentDetail) {
  return Math.max(
    payment.approvalProgress?.required ?? 0,
    payment.approvalSteps.length,
    payment.requiresDoubleApproval ? 2 : payment.requiresApproval ? 1 : 0,
  );
}

function approvalRequirement(payment: PaymentDetail) {
  if (payment.requiresDoubleApproval) return 'Dubbel attest, två olika attestanter';
  if (payment.requiresApproval) return 'Attest av en attestant';
  return 'Ingen attest, beloppet understeg attestgränsen';
}

export function PaymentDetailPage() {
  const { paymentId } = routeApi.useParams();
  const validId = Number.isInteger(paymentId) && paymentId > 0;
  const payment = usePayment(paymentId, { enabled: validId });
  const [decision, setDecision] = useState<ApprovalAction | null>(null);
  useDocumentTitle(validId ? `Betalning #${paymentId}` : 'Betalningen hittades inte');

  if (!validId || isApiError(payment.error, 404)) {
    return (
      <div className="page">
        <PageHeader title="Betalningen hittades inte" back={<BackLink />} />
        <Card>
          <EmptyState
            icon={LuSearchX}
            title="Betalningen finns inte"
            description="Kontrollera länken. Betalningen kan också tillhöra ett annat företag."
            action={
              <Link to="/payments" className={buttonClass({ variant: 'secondary' })}>
                Till betalningar
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  if (payment.isError) {
    return (
      <div className="page">
        <PageHeader title={`Betalning #${paymentId}`} back={<BackLink />} />
        <Card>
          <ErrorState
            error={payment.error}
            title="Betalningen kunde inte hämtas"
            onRetry={() => void payment.refetch()}
            retrying={payment.isFetching}
          />
        </Card>
      </div>
    );
  }

  if (payment.isPending) return <PaymentDetailSkeleton />;

  const data = payment.data;
  const totalSteps = totalStepsFor(data);
  const myStep = data.approvalSteps.find((step) => step.id === data.myApprovalStepId);

  return (
    <div className="page">
      <PageHeader
        back={<BackLink />}
        title={data.reference || 'Utan referens'}
        titleAside={<PaymentStatusBadge status={data.status} />}
        description={`Betalning #${data.id} · skapad ${formatDateTime(data.createdAt)} av ${data.createdByName}`}
      />

      <Card className="payment-hero">
        <div className="payment-hero__amount">
          <span className="payment-hero__label">Belopp</span>
          <Money amount={data.amount} currency={data.currency} className="payment-hero__value" />
        </div>
        <dl className="payment-hero__facts">
          <div>
            <dt>Till</dt>
            <dd>
              <IbanText iban={data.toIban} copyable />
            </dd>
          </div>
          <div>
            <dt>Från</dt>
            <dd>{data.fromAccountName}</dd>
          </div>
          <div>
            <dt>Attest</dt>
            <dd>
              {data.approvalProgress ? (
                <>
                  <ApprovalProgressText progress={data.approvalProgress} />
                  {data.requiresDoubleApproval && (
                    <Badge tone="info" size="sm" className="payment-hero__badge">
                      Dubbel attest
                    </Badge>
                  )}
                </>
              ) : (
                'Krävdes inte'
              )}
            </dd>
          </div>
        </dl>
      </Card>

      {data.myApprovalStepId !== null && (
        <section className="action-bar" aria-labelledby="my-approval-title">
          <div className="action-bar__text">
            <span className="action-bar__icon">
              <LuStamp aria-hidden="true" />
            </span>
            <div>
              <h2 className="action-bar__title" id="my-approval-title">
                Din attest krävs
              </h2>
              <p className="action-bar__description">
                {myStep && totalSteps > 1 ? `Steg ${myStep.stepNumber} av ${totalSteps}. ` : ''}
                Granska uppgifterna och godkänn eller avvisa betalningen.
              </p>
            </div>
          </div>
          <div className="action-bar__actions">
            <Button variant="danger-secondary" icon={LuX} onClick={() => setDecision('reject')}>
              Avvisa
            </Button>
            <Button icon={LuCheck} onClick={() => setDecision('approve')}>
              Godkänn
            </Button>
          </div>
        </section>
      )}

      <div className="detail-grid">
        <div className="detail-grid__main">
          <Card>
            <CardHeader title="Uppgifter" divider />
            <CardBody>
              <DescriptionList
                items={[
                  {
                    label: 'Från konto',
                    value: (
                      <span className="stacked">
                        <span>{data.fromAccountName}</span>
                        <IbanText iban={data.fromAccountIban} className="text-muted" />
                      </span>
                    ),
                  },
                  { label: 'Mottagare', value: <IbanText iban={data.toIban} copyable /> },
                  { label: 'Belopp', value: <Money amount={data.amount} currency={data.currency} /> },
                  { label: 'Referens', value: data.reference || 'Ingen referens' },
                  { label: 'Skapad av', value: data.createdByName },
                  { label: 'Skapad', value: formatDateTime(data.createdAt) },
                  {
                    label: 'Genomförd',
                    value: data.executedAt
                      ? formatDateTime(data.executedAt)
                      : data.status === 'rejected'
                        ? 'Genomfördes inte'
                        : 'Inte ännu',
                  },
                  { label: 'Källa', value: PAYMENT_SOURCE_LABELS[data.source] ?? data.source },
                  { label: 'Attestkrav', value: approvalRequirement(data), wide: true },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Händelser" description="Granskningsloggen för betalningen, äldst först." divider />
            <CardBody>
              {data.events.length === 0 ? (
                <EmptyState compact icon={LuScrollText} title="Inga händelser registrerade" />
              ) : (
                <ActivityList entries={data.events} />
              )}
            </CardBody>
          </Card>
        </div>

        <div className="detail-grid__side">
          <Card>
            <CardHeader title="Attestflöde" divider />
            <CardBody>
              <ApprovalTimeline payment={data} />
            </CardBody>
          </Card>
        </div>
      </div>

      {decision && data.myApprovalStepId !== null && (
        <DecisionDialog
          target={{
            approvalStepId: data.myApprovalStepId,
            paymentId: data.id,
            action: decision,
            amount: data.amount,
            currency: data.currency,
            reference: data.reference,
            toIban: data.toIban,
            fromAccountName: data.fromAccountName,
            createdByName: data.createdByName,
            stepNumber: myStep?.stepNumber,
            totalSteps,
          }}
          onClose={() => setDecision(null)}
        />
      )}
    </div>
  );
}

function PaymentDetailSkeleton() {
  return (
    <div className="page" aria-busy="true">
      <div className="page-header">
        <div className="page-header__back">
          <BackLink />
        </div>
        <Skeleton width={280} height={28} />
        <Skeleton width={360} height={14} className="skeleton--spaced" />
      </div>
      <Card className="payment-hero">
        <div className="payment-hero__amount">
          <Skeleton width={80} height={12} />
          <Skeleton width={220} height={36} />
        </div>
      </Card>
      <div className="detail-grid">
        <div className="detail-grid__main">
          <Card>
            <CardBody>
              <div className="skeleton-stack">
                {[0, 1, 2, 3, 4].map((row) => (
                  <Skeleton key={row} width={`${60 + row * 7}%`} />
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
        <div className="detail-grid__side">
          <Card>
            <CardBody>
              <div className="skeleton-stack">
                {[0, 1, 2].map((row) => (
                  <Skeleton key={row} width="80%" />
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
      <span className="visually-hidden" role="status">
        Laddar betalningen…
      </span>
    </div>
  );
}
