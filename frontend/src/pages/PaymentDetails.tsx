import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiMinus } from "react-icons/fi";
import { getAuditLog } from "../api/auditLogApi";
import PaymentsLayout from "../components/payments/PaymentsLayout";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import StatusBadge from "../components/shared/StatusBadge";
import { usePaymentOverview } from "../hooks/usePaymentOverview";
import type { AuditEntry } from "../types/AuditLog";
import {
  formatPaymentAmount,
  formatPaymentId,
  formatPaymentListDate,
  getPaymentStatus,
} from "../utils/paymentPresentation";

type ActivityState = { paymentId: number; entries: AuditEntry[]; error: string | null };

export default function PaymentDetails() {
  const { id } = useParams();
  const { data, isLoading, error, needsLogin, retry } = usePaymentOverview();
  const paymentId = id && /^\d+$/.test(id) ? Number(id) : NaN;
  const payment = Number.isSafeInteger(paymentId)
    ? data?.recentPayments.find((item) => item.id === paymentId)
    : undefined;
  const [activity, setActivity] = useState<ActivityState | null>(null);
  const selectedId = payment?.id;

  useEffect(() => {
    if (selectedId === undefined) return;
    const controller = new AbortController();

    getAuditLog({ limit: 50, signal: controller.signal })
      .then((audit) => {
        if (!controller.signal.aborted) {
          setActivity({
            paymentId: selectedId,
            entries: audit.entries.filter(
              (entry) => entry.entityType === "payment" && entry.entityId === selectedId
            ),
            error: null,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setActivity({ paymentId: selectedId, entries: [], error: "Kunde inte hämta aktivitetsloggen." });
        }
      });

    return () => controller.abort();
  }, [selectedId]);

  const currentActivity = activity?.paymentId === selectedId ? activity : null;
  const status = getPaymentStatus(payment?.status ?? null);
  const now = new Date();

  return (
    <PaymentsLayout title="Betalningar – Detaljer" overview={data} contentClassName="payments-details-content">
      <Link to="/payments" className="payments-back">
        <FiArrowLeft aria-hidden="true" />Tillbaka till alla betalningar
      </Link>
      <Card className="payments-detail-summary">
        <div>
          <div className="payments-detail-heading">
            <h2>{payment ? formatPaymentId(payment.id) : "Betalningsdetaljer"}</h2>
            {payment && (
              <StatusBadge status={status.variant} className="payments-status">{status.label}</StatusBadge>
            )}
          </div>
          <p>
            {payment ? (
              <>Skapad av — <span aria-hidden="true">•</span> <time dateTime={payment.createdAt}>{formatPaymentListDate(payment.createdAt, now)}</time></>
            ) : isLoading ? (
              <span role="status">Laddar betalning...</span>
            ) : error ? (
              <span role="alert" className="payments-error">{error}</span>
            ) : (
              <span role="status">Betalningen är inte tillgänglig bland de senaste betalningarna.</span>
            )}
          </p>
          {!isLoading && error && (needsLogin ? (
            <Link to="/" className="payments-text-link">Logga in</Link>
          ) : (
            <Button type="button" className="payments-text-link" onClick={retry}>Försök igen</Button>
          ))}
        </div>
        <div className="payments-detail-amount">
          <span>Belopp</span>
          <strong>{formatPaymentAmount(payment?.amount ?? null, payment?.currency ?? null, true)}</strong>
        </div>
      </Card>

      <div className="payments-details-grid">
        <Card className="payments-detail-card">
          <h2 id="payments-information-heading">Betalningsinformation</h2>
          <div className="payments-detail-body" role="region" aria-labelledby="payments-information-heading" tabIndex={0}>
            <dl className="payments-information">
              <div><dt>Mottagare</dt><dd>{payment?.toIban ? `IBAN ${payment.toIban}` : "—"}</dd></div>
              <div><dt>Bankgiro</dt><dd>—</dd></div>
              <div><dt>Avsändarkonto</dt><dd>—</dd></div>
              <div><dt>Valuta / Land</dt><dd>{payment?.currency ? `${payment.currency} / —` : "—"}</dd></div>
              <div><dt>BIC / SWIFT-kod</dt><dd>—</dd></div>
              <div><dt>Meddelande till mottagare</dt><dd>{payment?.reference || "—"}</dd></div>
              <div><dt>Avgiftsinställning</dt><dd>—</dd></div>
            </dl>
          </div>
        </Card>
        <Card className="payments-detail-card">
          <h2 id="payments-chain-heading">Godkännandekedja</h2>
          <div className="payments-detail-body" role="region" aria-labelledby="payments-chain-heading" tabIndex={0}>
            <div className="payments-chain-empty">
              <div className="payments-chain-marker" aria-hidden="true"><FiMinus /></div>
              <p>Godkännandekedjan är inte tillgänglig.</p>
            </div>
          </div>
        </Card>
        <Card className="payments-detail-card">
          <h2 id="payments-activity-heading" title="Matchande händelser bland de 50 senaste loggposterna.">Aktivitetslogg</h2>
          <p id="payments-activity-scope" className="payments-sr-only">
            Matchande händelser bland de 50 senaste loggposterna, inte fullständig betalningshistorik.
          </p>
          <div className="payments-detail-body" role="region" aria-labelledby="payments-activity-heading" tabIndex={0}>
            {payment && !currentActivity ? (
              <p className="payments-detail-state" role="status">Laddar aktivitet...</p>
            ) : currentActivity?.error ? (
              <p className="payments-detail-state payments-error" role="alert">{currentActivity.error}</p>
            ) : currentActivity?.entries.length ? (
              <ul className="payments-activity" aria-label="Aktivitet för betalningen" aria-describedby="payments-activity-scope">
                {currentActivity.entries.map((entry) => (
                  <li key={entry.id}>
                    <p>{entry.description || entry.action}</p>
                    <span>
                      {entry.userName || "—"} <span aria-hidden="true">•</span> <time dateTime={entry.createdAt}>{formatPaymentListDate(entry.createdAt, now)}</time>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="payments-detail-state">
                {payment ? "Inga matchande händelser bland de 50 senaste loggposterna." : "Aktivitetslogg är inte tillgänglig."}
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card className="payments-approval-bar">
        <p>Godkännandekrav: —</p>
        <div className="payments-approval-actions">
          <Button
            type="button"
            className="payments-action payments-action--reject"
            disabled
            title="Ett tilldelat godkännandesteg krävs för att avvisa betalningen"
          >Avvisa betalning</Button>
          <Button
            type="button"
            className="payments-action payments-action--primary"
            disabled
            title="Godkännandesteg och signeringsstöd är inte tillgängliga"
          >Godkänn &amp; Signera</Button>
        </div>
      </Card>
    </PaymentsLayout>
  );
}
