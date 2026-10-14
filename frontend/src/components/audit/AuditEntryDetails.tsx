import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiX } from "react-icons/fi";
import { getPaymentDetails, PaymentReadError } from "../../api/paymentsApi";
import ApprovalTimeline from "../approvals/ApprovalTimeline";
import StatusBadge from "../shared/StatusBadge";
import type { AuditEntry } from "../../types/AuditLog";
import type { PaymentDetails } from "../../types/Payment";
import { formatDateTime, formatEntity, getActionPresentation } from "../../utils/auditPresentation";
import { formatPaymentAmount, getPaymentStatus } from "../../utils/paymentPresentation";
import "../../styles/approvalInbox.css";
import "../../styles/auditEntryDetails.css";

type AuditEntryDetailsProps = {
  entry: AuditEntry;
  onClose: () => void;
};

type PaymentHistoryLoad = {
  paymentId: number;
  attempt: number;
  data: PaymentDetails | null;
  error: { message: string; status?: number } | null;
};

export default function AuditEntryDetails({ entry, onClose }: AuditEntryDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const action = getActionPresentation(entry.action);
  const entity = formatEntity(entry);
  const paymentId = entry.entityType?.trim().toLowerCase() === "payment" &&
    entry.entityId != null && Number.isSafeInteger(entry.entityId) && entry.entityId > 0
      ? entry.entityId
      : null;
  const [historyLoad, setHistoryLoad] = useState<PaymentHistoryLoad | null>(null);
  const [attempt, setAttempt] = useState(0);
  const currentLoad = historyLoad?.paymentId === paymentId && historyLoad?.attempt === attempt
    ? historyLoad
    : null;
  const payment = currentLoad?.data ?? null;
  const isLoadingPayment = paymentId !== null && currentLoad === null;
  const paymentStatus = getPaymentStatus(payment?.status ?? null);

  useEffect(() => {
    if (paymentId === null) return;

    const controller = new AbortController();
    getPaymentDetails(paymentId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setHistoryLoad({ paymentId, attempt, data, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setHistoryLoad({
            paymentId,
            attempt,
            data: null,
            error: {
              message: error instanceof PaymentReadError
                ? error.message
                : "Kunde inte hämta betalningens förlopp. Försök igen.",
              status: error instanceof PaymentReadError ? error.status : undefined,
            },
          });
        }
      });

    return () => controller.abort();
  }, [paymentId, attempt]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();
    closeButtonRef.current?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      id="audit-entry-details"
      ref={dialogRef}
      className="audit-entry-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="audit-entry-header">
        <div>
          <p className="audit-entry-label">{paymentId !== null ? "Betalningshistorik · " : ""}Audit #{entry.id}</p>
          <h2 id={titleId}>{paymentId !== null ? `Betalning #${paymentId}` : action.label}</h2>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="audit-entry-close"
          onClick={onClose}
          aria-label="Stäng händelsedetaljer"
        >
          <FiX aria-hidden="true" />
        </button>
      </header>

      <div className="audit-entry-content">
        {isLoadingPayment && <p role="status">Hämtar betalningens förlopp...</p>}
        {currentLoad?.error && (
          <div className="audit-entry-load-error">
            <p role="alert">{currentLoad.error.message}</p>
            {currentLoad.error.status === 401 ? (
              <Link to="/" className="audit-entry-link">Logga in</Link>
            ) : (
              <button type="button" className="audit-entry-dismiss" onClick={() => setAttempt((value) => value + 1)}>Försök igen</button>
            )}
          </div>
        )}
        {payment && (
          <>
            <section aria-labelledby={`${titleId}-payment`}>
              <div className="audit-entry-payment-heading">
                <h3 id={`${titleId}-payment`}>Betalningsinformation</h3>
                <div className="audit-entry-payment-status">
                  <span>Aktuell status</span>
                  <StatusBadge status={paymentStatus.variant}>{paymentStatus.label}</StatusBadge>
                </div>
              </div>
              <dl className="audit-entry-fields">
                <div><dt>Belopp</dt><dd className="audit-entry-amount">{formatPaymentAmount(payment.amount, payment.currency, true)}</dd></div>
                <div><dt>Avsändarkonto</dt><dd>{payment.fromAccountName || `Konto #${payment.fromAccountId}`}</dd></div>
                <div><dt>Mottagare</dt><dd>{payment.recipientName?.trim() || "Mottagarens namn saknas"}</dd></div>
                <div><dt>Mottagarkonto</dt><dd>{payment.toIban}</dd></div>
                <div className="audit-entry-field-wide"><dt>Referens</dt><dd>{payment.reference || "Ingen referens"}</dd></div>
              </dl>
            </section>
            <ApprovalTimeline
              heading="Betalningens förlopp"
              creation={{ createdByName: payment.createdByName, createdAt: payment.createdAt }}
              timeline={payment.approvalTimeline}
              completion={payment.status === "completed" && payment.executedAt
                ? { executedAt: payment.executedAt, toIban: payment.toIban, recipientName: payment.recipientName }
                : undefined}
              emptyMessage="Inga separata atteststeg är registrerade för betalningen."
            />
          </>
        )}

        <section className="audit-entry-selected-event" aria-labelledby={`${titleId}-event`}>
          <h3 id={`${titleId}-event`}>{paymentId !== null ? "Vald händelse i auditloggen" : "Händelseinformation"}</h3>
          <dl className="audit-entry-fields">
            <div className="audit-entry-field-wide">
              <dt>Händelse</dt>
              <dd>{action.label}</dd>
            </div>
            <div>
              <dt>Datum/tid</dt>
              <dd><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time></dd>
            </div>
            <div>
              <dt>Utförd av</dt>
              <dd>{entry.userName?.trim() || "Okänd användare"}</dd>
            </div>
            <div>
              <dt>Gäller</dt>
              <dd>{entity || "Uppgift saknas"}</dd>
            </div>
          </dl>
          <p className="audit-entry-description">
            {entry.description?.trim() ? entry.description : "Uppgifter saknas."}
          </p>
        </section>
      </div>

      <footer className="audit-entry-footer">
        <button type="button" className="audit-entry-dismiss" onClick={onClose}>Stäng</button>
      </footer>
    </dialog>
  );
}
