import { useLayoutEffect, useRef } from "react";
import { FiCheckCircle, FiClock, FiX } from "react-icons/fi";
import type { CreatePaymentResponse } from "../../types/Payment";
import { formatPaymentAmount } from "../../utils/paymentPresentation";
import Button from "../shared/Button";
import "../../styles/newRecipient.css";
import "../../styles/paymentConfirmation.css";

type PaymentConfirmationDialogProps = {
  payment: CreatePaymentResponse;
  onClose: () => void;
};

export default function PaymentConfirmationDialog({ payment, onClose }: PaymentConfirmationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isPending = payment.status === "pending_approval";

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const returnFocus = previousFocus instanceof HTMLElement && previousFocus !== document.body
      ? previousFocus
      : document.querySelector<HTMLButtonElement>(".new-payment-submit");
    dialog?.showModal();
    dialog?.querySelector<HTMLButtonElement>(".payment-confirmation-okay")?.focus();
    return () => {
      dialog?.close();
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="new-recipient-dialog payment-confirmation-dialog"
      aria-labelledby="payment-confirmation-title"
      aria-describedby="payment-confirmation-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <header className="new-recipient-header">
        <div className="payment-confirmation-heading">
          <span className={`payment-confirmation-icon${isPending ? " payment-confirmation-icon--pending" : ""}`} aria-hidden="true">
            {isPending ? <FiClock /> : <FiCheckCircle />}
          </span>
          <div>
            <p className="new-recipient-step">Betalning skapad</p>
            <h2 id="payment-confirmation-title">
              {isPending ? "Väntar på godkännande" : "Betalningen är genomförd"}
            </h2>
          </div>
        </div>
        <button type="button" className="new-recipient-close" onClick={onClose} aria-label="Stäng betalningsbekräftelsen">
          <FiX aria-hidden="true" />
        </button>
      </header>

      <div className="new-recipient-form">
        <p id="payment-confirmation-description">
          {isPending
            ? "Betalningen har skapats och behöver godkännas av en attestant innan den genomförs."
            : "Betalningen har genomförts och kontots saldo har uppdaterats."}
        </p>
        <dl className="new-recipient-summary payment-confirmation-summary">
          <div><dt>Belopp</dt><dd>{formatPaymentAmount(payment.amount, payment.currency)}</dd></div>
          <div><dt>Betalnings-ID</dt><dd>#{payment.id}</dd></div>
          <div className="payment-confirmation-recipient"><dt>Mottagarkonto</dt><dd>{payment.toIban}</dd></div>
        </dl>
        <footer className="new-recipient-actions">
          <Button type="button" className="new-payment-submit payment-confirmation-okay" autoFocus onClick={onClose}>
            Okej
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
