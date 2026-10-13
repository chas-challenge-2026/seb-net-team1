import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FiX } from "react-icons/fi";
import { getPaymentDetails } from "../../api/paymentsApi";
import Button from "../shared/Button";
import ApprovalTimeline from "./ApprovalTimeline";
import type { HandledApproval } from "../../types/Approval";
import type { PaymentDetails } from "../../types/Payment";

type ApprovalHistoryDetailsProps = {
  approval: HandledApproval;
  onClose: () => void;
};

type HistoryLoad = {
  paymentId: number;
  requestVersion: number;
  details: PaymentDetails | null;
  error: string | null;
};

export default function ApprovalHistoryDetails({ approval, onClose }: ApprovalHistoryDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [historyLoad, setHistoryLoad] = useState<HistoryLoad | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const currentLoad = historyLoad?.paymentId === approval.paymentId && historyLoad.requestVersion === requestVersion
    ? historyLoad
    : null;
  const details = currentLoad?.details ?? null;
  const isLoading = currentLoad === null;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const paymentId = approval.paymentId;

    getPaymentDetails(paymentId, controller.signal)
      .then((payment) => {
        if (!controller.signal.aborted) {
          setHistoryLoad({ paymentId, requestVersion, details: payment, error: null });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistoryLoad({
            paymentId,
            requestVersion,
            details: null,
            error: "Kunde inte hämta hela betalningshistoriken. Den tidigare attesthistoriken visas nedan.",
          });
        }
      });

    return () => controller.abort();
  }, [approval.paymentId, requestVersion]);

  return (
    <dialog
      ref={dialogRef}
      className="approval-details-dialog"
      aria-labelledby="approval-history-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="approval-details-header">
        <div>
          <p className="approval-details-label">Betalningshistorik</p>
          <h2 id="approval-history-title">Betalning #{approval.paymentId}</h2>
        </div>
        <button type="button" className="approval-details-close" onClick={onClose} aria-label="Stäng betalningshistorik"><FiX aria-hidden="true" /></button>
      </header>
      <div className="approval-details-content">
        {isLoading && <p role="status">Hämtar betalningshistorik...</p>}
        {currentLoad?.error && (
          <div className="approval-details-decision-error">
            <p className="approval-inbox-error" role="alert">{currentLoad.error}</p>
            <Button type="button" className="approval-inbox-button approval-details-secondary" onClick={() => setRequestVersion((version) => version + 1)}>Försök igen</Button>
          </div>
        )}
        <ApprovalTimeline
          heading="Betalningshistorik"
          timeline={details?.approvalTimeline ?? approval.timeline}
          creation={details ? { createdByName: details.createdByName ?? null, createdAt: details.createdAt } : undefined}
        />
      </div>
      <footer className="approval-details-footer approval-history-footer">
        <Button type="button" className="approval-inbox-button approval-details-secondary" onClick={onClose}>Stäng</Button>
      </footer>
    </dialog>
  );
}
