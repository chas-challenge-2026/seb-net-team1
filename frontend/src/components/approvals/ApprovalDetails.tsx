import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiX } from "react-icons/fi";
import { ApprovalDecisionApiError, decideApproval } from "../../api/approvalsApi";
import Button from "../shared/Button";
import StatusBadge from "../shared/StatusBadge";
import ApprovalTimeline from "./ApprovalTimeline";
import type { ApprovalDecisionRequest, ApprovalDecisionResponse, PendingApproval } from "../../types/Approval";

type ApprovalDetailsProps = {
  approval: PendingApproval;
  onClose: () => void;
  onDecision: (decision: ApprovalDecisionResponse) => void;
  onRefresh: () => void;
};

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ApprovalDetails({ approval, onClose, onDecision, onRefresh }: ApprovalDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestInFlight = useRef(false);
  const mounted = useRef(false);
  const [comment, setComment] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<ApprovalDecisionApiError | null>(null);
  const needsRefresh = decisionError !== null && decisionError.status !== 400;
  const reference = approval.reference || `Betalning #${approval.paymentId}`;
  const createdAt = new Date(approval.createdAt);
  const amount = new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: approval.currency,
  }).format(Number(approval.amount));

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    mounted.current = true;
    dialog?.showModal();

    return () => {
      mounted.current = false;
      dialog?.close();
    };
  }, []);

  async function saveDecision(action: ApprovalDecisionRequest["action"]) {
    if (requestInFlight.current || needsRefresh) return;

    requestInFlight.current = true;
    setIsSaving(true);
    setDecisionError(null);

    try {
      const decision = await decideApproval(approval.approvalStepId, {
        action,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      if (decision.paymentId !== approval.paymentId) {
        throw new ApprovalDecisionApiError(200);
      }
      if (mounted.current) onDecision(decision);
    } catch (cause: unknown) {
      if (mounted.current) {
        setDecisionError(cause instanceof ApprovalDecisionApiError ? cause : new ApprovalDecisionApiError(0));
      }
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setIsSaving(false);
    }
  }

  function closeDetails() {
    if (requestInFlight.current) return;
    if (needsRefresh) onRefresh();
    else onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="approval-details-dialog"
      aria-labelledby="approval-details-title"
      onCancel={(event) => {
        event.preventDefault();
        closeDetails();
      }}
    >
      <header className="approval-details-header">
        <div>
          <p className="approval-details-label">Betalningsdetaljer</p>
          <h2 id="approval-details-title">{reference}</h2>
        </div>
        <button
          type="button"
          className="approval-details-close"
          onClick={closeDetails}
          disabled={isSaving}
          aria-label="Stäng betalningsdetaljer"
        >
          <FiX aria-hidden="true" />
        </button>
      </header>

      <div className="approval-details-content">
        <section aria-labelledby="approval-details-payment-heading">
          <h3 id="approval-details-payment-heading">Betalningsuppgifter</h3>
          <dl className="approval-details-fields">
            <div><dt>Belopp</dt><dd className="approval-details-amount">{amount}</dd></div>
            <div><dt>Status</dt><dd><StatusBadge status="pending">Väntar på godkännande</StatusBadge></dd></div>
            <div><dt>Avsändarkonto</dt><dd>{approval.fromAccountName}</dd></div>
            <div><dt>Mottagarkonto</dt><dd>{approval.toIban}</dd></div>
            <div><dt>Referens</dt><dd>{reference}</dd></div>
            <div>
              <dt>Skapad</dt>
              <dd><time dateTime={approval.createdAt}>{Number.isNaN(createdAt.getTime()) ? "—" : dateTimeFormatter.format(createdAt)}</time></dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="approval-details-creator-heading">
          <h3 id="approval-details-creator-heading">Skapad av</h3>
          <p>{approval.createdByName || "Okänd"}</p>
        </section>

        <ApprovalTimeline timeline={approval.timeline} />

        <section className="approval-details-decision" aria-labelledby="approval-details-decision-heading" aria-busy={isSaving}>
          <h3 id="approval-details-decision-heading">Ditt beslut</h3>
          <label htmlFor="approval-decision-comment">Kommentar (valfri)</label>
          <textarea
            id="approval-decision-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={255}
            rows={3}
            disabled={isSaving || needsRefresh}
            aria-describedby="approval-decision-comment-help"
          />
          <p id="approval-decision-comment-help" className="approval-details-comment-help">Högst 255 tecken.</p>
          {isSaving && <p role="status">Sparar ditt beslut...</p>}
          {decisionError && (
            <div className="approval-details-decision-error">
              <p className="approval-inbox-error" role="alert">{decisionError.message}</p>
              {decisionError.status === 401 ? (
                <Link to="/" className="approval-inbox-link">Till inloggning</Link>
              ) : needsRefresh ? (
                <Button type="button" className="approval-inbox-button" onClick={onRefresh}>Uppdatera listan</Button>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <footer className="approval-details-footer">
        <Button type="button" className="approval-inbox-button approval-details-secondary" onClick={closeDetails} disabled={isSaving}>Stäng</Button>
        <div className="approval-details-actions">
          <Button type="button" className="approval-inbox-button approval-details-reject" onClick={() => void saveDecision("reject")} disabled={isSaving || needsRefresh}>Avvisa</Button>
          <Button type="button" className="approval-inbox-button" onClick={() => void saveDecision("approve")} disabled={isSaving || needsRefresh}>Godkänn</Button>
        </div>
      </footer>
    </dialog>
  );
}
