import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiCheckCircle } from "react-icons/fi";
import { getPaymentDetails, PaymentReadError } from "../api/paymentsApi";
import PaymentsLayout from "../components/payments/PaymentsLayout";
import ApprovalTimeline from "../components/approvals/ApprovalTimeline";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import StatusBadge from "../components/shared/StatusBadge";
import { usePaymentOverview } from "../hooks/usePaymentOverview";
import type { PaymentDetails as PaymentDetailsData } from "../types/Payment";
import "../styles/approvalInbox.css";
import { canReadAuditLog } from "../utils/auditAccess";
import {
  formatPaymentAmount,
  formatPaymentDate,
  formatPaymentId,
  getPaymentStatus,
} from "../utils/paymentPresentation";

type DetailState = {
  requestKey: string | null;
  data: PaymentDetailsData | null;
  loading: boolean;
  error: string | null;
  needsLogin: boolean;
};

const INITIAL_DETAIL_STATE: DetailState = {
  requestKey: null,
  data: null,
  loading: true,
  error: null,
  needsLogin: false,
};

export default function PaymentDetails() {
  const { id } = useParams();
  const { data: overview } = usePaymentOverview();
  const paymentId = id && /^\d+$/.test(id) ? Number(id) : NaN;
  const isValidPaymentId = Number.isSafeInteger(paymentId) && paymentId > 0;
  const [detail, setDetail] = useState<DetailState>(INITIAL_DETAIL_STATE);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${paymentId}:${attempt}`;
  const displayedDetail = isValidPaymentId
    ? detail.requestKey === requestKey ? detail : INITIAL_DETAIL_STATE
    : {
        requestKey,
        data: null,
        loading: false,
        error: "Betalningsnumret är ogiltigt.",
        needsLogin: false,
      };

  useEffect(() => {
    if (!isValidPaymentId) return;

    const controller = new AbortController();

    getPaymentDetails(paymentId, controller.signal)
      .then((payment) => {
        if (!controller.signal.aborted) {
          setDetail({ requestKey, data: payment, loading: false, error: null, needsLogin: false });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDetail({
            requestKey,
            data: null,
            loading: false,
            error: error instanceof TypeError
              ? "Kunde inte nå backend-API:t. Kontrollera anslutningen och försök igen."
              : error instanceof Error ? error.message : "Kunde inte hämta betalningen.",
            needsLogin: error instanceof PaymentReadError && error.status === 401,
          });
        }
      });

    return () => controller.abort();
  }, [paymentId, attempt, isValidPaymentId, requestKey]);

  const payment = displayedDetail.data;
  const status = getPaymentStatus(payment?.status ?? null);
  const canOpenInbox = canReadAuditLog(overview?.user?.role);

  return (
    <PaymentsLayout
      title="Betalningsdetaljer"
      overview={overview}
      contentClassName="payments-details-content"
    >
      <Link to="/payments" className="payments-back">
        <FiArrowLeft aria-hidden="true" />Tillbaka till betalningar
      </Link>

      {displayedDetail.loading ? (
        <Card className="payments-detail-card">
          <p className="payments-detail-state" role="status">Hämtar betalningen...</p>
        </Card>
      ) : displayedDetail.error ? (
        <Card className="payments-detail-card">
          <p className="payments-error" role="alert">{displayedDetail.error}</p>
          {displayedDetail.needsLogin ? (
            <Link to="/" className="payments-text-link">Logga in</Link>
          ) : (
            <Button type="button" className="payments-action payments-action--secondary" onClick={() => setAttempt((value) => value + 1)}>
              Försök igen
            </Button>
          )}
        </Card>
      ) : payment ? (
        <>
          <Card className="payments-detail-summary">
            <div>
              <div className="payments-detail-heading">
                <h2>{formatPaymentId(payment.id)}</h2>
                <StatusBadge status={status.variant} className="payments-status">{status.label}</StatusBadge>
              </div>
              <p>
                {payment.createdByName || "Okänd användare"}
                <span aria-hidden="true"> • </span>
                <time dateTime={payment.createdAt}>{formatPaymentDate(payment.createdAt)}</time>
              </p>
            </div>
            <div className="payments-detail-amount">
              <span>Belopp</span>
              <strong>{formatPaymentAmount(payment.amount, payment.currency, true)}</strong>
            </div>
          </Card>

          <div className="payments-details-grid">
            <Card className="payments-detail-card">
              <h2 id="payments-information-heading">Betalningsinformation</h2>
              <div className="payments-detail-body" role="region" aria-labelledby="payments-information-heading" tabIndex={0}>
                <dl className="payments-information">
                  <div><dt>Avsändarkonto</dt><dd>{payment.fromAccountName || `Konto #${payment.fromAccountId}`}</dd></div>
                  <div><dt>Mottagarkonto</dt><dd>{payment.toIban}</dd></div>
                  <div><dt>Referens</dt><dd>{payment.reference || "Ingen referens"}</dd></div>
                  <div><dt>Skapad</dt><dd><time dateTime={payment.createdAt}>{formatPaymentDate(payment.createdAt)}</time></dd></div>
                  <div><dt>Genomförd</dt><dd>{payment.executedAt ? <time dateTime={payment.executedAt}>{formatPaymentDate(payment.executedAt)}</time> : "Inte genomförd"}</dd></div>
                </dl>
              </div>
            </Card>

            <Card className="payments-detail-card">
              <h2 id="payments-chain-heading">Godkännandekedja</h2>
              <div className="payments-detail-body" role="region" aria-labelledby="payments-chain-heading" tabIndex={0}>
                {payment.approvalTimeline.length > 0 ? (
                  <ApprovalTimeline timeline={payment.approvalTimeline} />
                ) : (
                  <div className="payments-chain-empty">
                    <div className="payments-chain-marker" aria-hidden="true"><FiCheckCircle /></div>
                    <p>{payment.status === "completed"
                      ? "Ingen separat attest krävdes för den här betalningen."
                      : "Ingen attestkedja har registrerats för betalningen."}</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="payments-detail-card">
              <h2 id="payments-activity-heading">Betalningsaktivitet</h2>
              <div className="payments-detail-body" role="region" aria-labelledby="payments-activity-heading" tabIndex={0}>
                {payment.activity.length > 0 ? (
                  <ul className="payments-activity" aria-label="Aktivitet för betalningen">
                    {payment.activity.map((entry) => (
                      <li key={entry.id}>
                        <p>{entry.description || entry.action}</p>
                        <span>
                          {entry.userName || "Systemet"}
                          <span aria-hidden="true"> • </span>
                          <time dateTime={entry.createdAt}>{formatPaymentDate(entry.createdAt)}</time>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="payments-detail-state">Ingen betalningsaktivitet är registrerad.</p>
                )}
              </div>
            </Card>
          </div>

          {payment.status === "pending_approval" && (
            <Card className="payments-approval-bar">
              <p>Betalningen väntar på godkännande.</p>
              {canOpenInbox ? (
                <Link to="/approval-inbox" className="payments-action payments-action--primary">Öppna godkännanden</Link>
              ) : (
                <p>En attestant behöver godkänna betalningen innan den genomförs.</p>
              )}
            </Card>
          )}
        </>
      ) : null}
    </PaymentsLayout>
  );
}
