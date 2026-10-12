import { useLayoutEffect, useRef } from "react";
import { FiX } from "react-icons/fi";
import Button from "../shared/Button";
import ApprovalTimeline from "./ApprovalTimeline";
import type { HandledApproval } from "../../types/Approval";

type ApprovalHistoryDetailsProps = {
  approval: HandledApproval;
  onClose: () => void;
};

export default function ApprovalHistoryDetails({ approval, onClose }: ApprovalHistoryDetailsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

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
          <p className="approval-details-label">Attesthistorik</p>
          <h2 id="approval-history-title">Betalning #{approval.paymentId}</h2>
        </div>
        <button type="button" className="approval-details-close" onClick={onClose} aria-label="Stäng attesthistorik"><FiX aria-hidden="true" /></button>
      </header>
      <div className="approval-details-content">
        <ApprovalTimeline timeline={approval.timeline} />
      </div>
      <footer className="approval-details-footer approval-history-footer">
        <Button type="button" className="approval-inbox-button approval-details-secondary" onClick={onClose}>Stäng</Button>
      </footer>
    </dialog>
  );
}
