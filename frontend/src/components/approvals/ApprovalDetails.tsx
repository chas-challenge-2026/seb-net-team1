import { useLayoutEffect, useRef } from "react";
import { FiX } from "react-icons/fi";
import Button from "../shared/Button";
import StatusBadge from "../shared/StatusBadge";
import type { PendingApproval } from "../../types/Approval";

type ApprovalDetailsProps = {
  approval: PendingApproval;
  onClose: () => void;
};

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ApprovalDetails({ approval, onClose }: ApprovalDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reference = approval.reference || `Betalning #${approval.paymentId}`;
  const createdAt = new Date(approval.createdAt);
  const amount = new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: approval.currency,
  }).format(Number(approval.amount));

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();

    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="approval-details-dialog"
      aria-labelledby="approval-details-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
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
          onClick={onClose}
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

        <section aria-labelledby="approval-details-attestants-heading">
          <h3 id="approval-details-attestants-heading">Attestanter</h3>
          {approval.attestants?.length ? (
            <ol className="approval-details-attestants">
              {approval.attestants.map((attestant, index) => (
                <li key={`${attestant.stepNumber}-${index}`}>
                  <span>Atteststeg {attestant.stepNumber}</span>
                  <strong>{attestant.name ?? "Inte tilldelad"}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="approval-details-missing">Uppgifter om attestanter saknas.</p>
          )}
        </section>
      </div>

      <footer className="approval-details-footer">
        <Button type="button" className="approval-inbox-button" onClick={onClose}>Stäng</Button>
      </footer>
    </dialog>
  );
}
