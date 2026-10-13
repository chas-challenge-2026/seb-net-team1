import { useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiCheck, FiX } from "react-icons/fi";
import { createRecipient, getRecipientDetailsError, normalizeRecipientIban, RecipientApiError } from "../../api/recipientsApi";
import type { Recipient } from "../../types/Recipient";
import Button from "../shared/Button";
import "../../styles/newRecipient.css";

type NewRecipientDialogProps = {
  onClose: () => void;
  onSaved: (recipient: Recipient) => void;
};

export default function NewRecipientDialog({ onClose, onSaved }: NewRecipientDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestInFlight = useRef(false);
  const mounted = useRef(false);
  const [step, setStep] = useState<"details" | "confirmation">("details");
  const [name, setName] = useState("");
  const [iban, setIban] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<RecipientApiError | null>(null);
  const needsLogin = error?.status === 401;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    mounted.current = true;
    dialog?.showModal();
    return () => {
      mounted.current = false;
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useLayoutEffect(() => {
    if (step === "confirmation") headingRef.current?.focus();
  }, [step]);

  function closeDialog() {
    if (!requestInFlight.current) onClose();
  }

  function continueToConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const detailsError = getRecipientDetailsError(name, iban);
    if (detailsError) {
      setError(new RecipientApiError(400, detailsError));
      return;
    }
    setName(name.trim());
    setIban(normalizeRecipientIban(iban));
    setError(null);
    setStep("confirmation");
  }

  async function confirmDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInFlight.current || needsLogin) return;
    requestInFlight.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const recipient = await createRecipient({ name, iban, demoConfirmed: true });
      if (mounted.current) onSaved(recipient);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof RecipientApiError ? cause : new RecipientApiError(0));
    } finally {
      requestInFlight.current = false;
      if (mounted.current) setIsSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="new-recipient-dialog"
      aria-labelledby="new-recipient-title"
      aria-describedby="new-recipient-description"
      onCancel={(event) => { event.preventDefault(); closeDialog(); }}
    >
      <header className="new-recipient-header">
        <div>
          <p className="new-recipient-step">Steg {step === "details" ? "1" : "2"} av 2</p>
          <h2 id="new-recipient-title" ref={headingRef} tabIndex={-1}>
            {step === "details" ? "Lägg till mottagare" : "BankID-demo"}
          </h2>
        </div>
        <button type="button" className="new-recipient-close" onClick={closeDialog} disabled={isSaving} aria-label="Stäng mottagardialogen">
          <FiX aria-hidden="true" />
        </button>
      </header>

      {step === "details" ? (
        <form className="new-recipient-form" onSubmit={continueToConfirmation} autoComplete="off">
          <p id="new-recipient-description">Spara en mottagare så att du kan välja den vid nästa betalning.</p>
          <div className="new-payment-field">
            <label htmlFor="new-recipient-name">Mottagarens namn</label>
            <input id="new-recipient-name" name="recipientName" type="text" autoComplete="off" maxLength={100} value={name} onChange={(event) => { setName(event.target.value); setError(null); }} autoFocus required />
          </div>
          <div className="new-payment-field">
            <label htmlFor="new-recipient-iban">IBAN</label>
            <input id="new-recipient-iban" name="recipientIban" type="text" autoComplete="off" placeholder="SE00 0000 0000 0000 0000 0000" maxLength={42} value={iban} onChange={(event) => { setIban(event.target.value); setError(null); }} autoCapitalize="characters" spellCheck={false} required />
          </div>
          {error && <p role="alert" className="new-recipient-error">{error.message}</p>}
          <footer className="new-recipient-actions">
            <Button type="button" className="new-recipient-secondary" onClick={closeDialog}>Avbryt</Button>
            <Button type="submit" className="new-payment-submit">Nästa: BankID-demo</Button>
          </footer>
        </form>
      ) : (
        <form className="new-recipient-form" onSubmit={(event) => void confirmDemo(event)} autoComplete="off" aria-busy={isSaving}>
          <p id="new-recipient-description" className="new-recipient-demo-notice"><strong>Ingen riktig BankID-legitimering görs.</strong> Detta är en simulerad bekräftelse för demonstrationen.</p>
          <dl className="new-recipient-summary">
            <div><dt>Mottagare</dt><dd>{name}</dd></div>
            <div><dt>IBAN</dt><dd>{iban}</dd></div>
          </dl>
          <p>Kontrollera uppgifterna och bekräfta för att spara mottagaren.</p>
          {isSaving && <p role="status">Sparar mottagaren...</p>}
          {error && (
            <div className="new-recipient-error" role="alert">
              <p>{error.message}</p>
              {needsLogin && <Link to="/">Till inloggning</Link>}
            </div>
          )}
          <footer className="new-recipient-actions">
            <Button type="button" className="new-recipient-secondary" onClick={() => { setStep("details"); setError(null); }} disabled={isSaving}><FiArrowLeft aria-hidden="true" />Ändra uppgifter</Button>
            <Button type="submit" className="new-payment-submit" disabled={isSaving || needsLogin}><FiCheck aria-hidden="true" />{isSaving ? "Sparar..." : error ? "Försök igen: bekräfta demo" : "Bekräfta demo och spara"}</Button>
          </footer>
          <Button type="button" className="new-recipient-cancel" onClick={closeDialog} disabled={isSaving}>Avbryt</Button>
        </form>
      )}
    </dialog>
  );
}
