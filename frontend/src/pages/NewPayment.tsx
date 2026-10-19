import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiBell, FiPlus, FiSearch } from "react-icons/fi";
import { getAccounts } from "../api/accountsApi";
import { createPayment, PAYMENT_PERMISSION_ERROR } from "../api/paymentsApi";
import { getRecipients, normalizeRecipientIban, RecipientApiError } from "../api/recipientsApi";
import { getHistoricalRecipients } from "../api/historicalRecipientsApi";
import Sidebar from "../components/dashboard/Sidebar";
import NewRecipientDialog from "../components/payments/NewRecipientDialog";
import PaymentConfirmationDialog from "../components/payments/PaymentConfirmationDialog";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import type { Account } from "../types/Account";
import type { Recipient } from "../types/Recipient";
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
} from "../types/Payment";
import { PAYMENT_AMOUNT_ERROR, parsePaymentAmount } from "../utils/paymentAmount";
import { getPaymentRecipientOptions } from "../utils/paymentRecipients";
import "../styles/dashboard.css";
import "../styles/newPayment.css";

type PaymentFormState = Omit<CreatePaymentRequest, "amount"> & { amount: string };

function getStoredRole(): string | null {
  try {
    const storedUser = localStorage.getItem("user");
    const role = storedUser ? JSON.parse(storedUser)?.role : null;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

function NewPayment() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [accountLoadError, setAccountLoadError] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormState>({
    fromAccountId: 0,
    toIban: "",
    amount: "",
    reference: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdPayment, setCreatedPayment] =
    useState<CreatePaymentResponse | null>(null);
  const [isPaymentConfirmationOpen, setIsPaymentConfirmationOpen] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState("");
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(true);
  const [recipientLoadError, setRecipientLoadError] = useState<string | null>(null);
  const [demoConfirmationEnabled, setDemoConfirmationEnabled] = useState(false);
  const [recipientRequestVersion, setRecipientRequestVersion] = useState(0);
  const [isRecipientDialogOpen, setIsRecipientDialogOpen] = useState(false);
  const [recipientSaveMessage, setRecipientSaveMessage] = useState<string | null>(null);
  const [historicalIbans, setHistoricalIbans] = useState<string[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const role = getStoredRole();
  const canAddRecipients = role === "initiator" || role === "admin";
  const recipientOptions = getPaymentRecipientOptions(recipients, historicalIbans);
  const selectedRecipient = selectedRecipientId
    ? recipientOptions.find((option) => option.iban === normalizeRecipientIban(paymentForm.toIban))
    : undefined;

  useEffect(() => {
    let isMounted = true;

    async function loadAccounts() {
      try {
        setIsLoadingAccounts(true);
        setAccountLoadError(null);

        const fetchedAccounts = await getAccounts();

        if (isMounted) {
          setAccounts(fetchedAccounts);
        }
      } catch {
        if (isMounted) {
          setAccountLoadError("Kunde inte hämta konton.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingAccounts(false);
        }
      }
    }

    loadAccounts();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getRecipients(controller.signal)
      .then((list) => {
        if (controller.signal.aborted) return;
        setRecipients(list.recipients);
        setDemoConfirmationEnabled(list.demoConfirmationEnabled);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setDemoConfirmationEnabled(false);
        setRecipientLoadError(cause instanceof RecipientApiError
          ? cause.message
          : "Kunde inte hämta sparade mottagare. Du kan fortfarande ange IBAN manuellt.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingRecipients(false);
      });
    return () => controller.abort();
  }, [recipientRequestVersion]);

  useEffect(() => {
    const controller = new AbortController();
    getHistoricalRecipients(controller.signal)
      .then((history) => {
        if (controller.signal.aborted) return;
        setHistoricalIbans(history.ibans);
        if (history.incomplete) {
          setHistoryLoadError("Vissa tidigare mottagare kunde inte kontrolleras. Du kan fortfarande välja sparade mottagare eller ange IBAN manuellt.");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHistoryLoadError("Tidigare godkända mottagare kunde inte hämtas. Du kan fortfarande välja sparade mottagare eller ange IBAN manuellt.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingHistory(false);
      });
    return () => controller.abort();
  }, [recipientRequestVersion]);

  function refreshRecipients() {
    setIsLoadingRecipients(true);
    setDemoConfirmationEnabled(false);
    setRecipientLoadError(null);
    setIsLoadingHistory(true);
    setHistoryLoadError(null);
    setHistoricalIbans([]);
    setRecipientRequestVersion((version) => version + 1);
  }

  function selectRecipient(value: number | string, iban: string) {
    setSelectedRecipientId(String(value));
    setPaymentForm((current) => ({ ...current, toIban: iban }));
    setSubmitError(null);
    setCreatedPayment(null);
  }

  function handleRecipientSaved(recipient: Recipient) {
    setRecipients((current) => [...current.filter((item) => item.id !== recipient.id), recipient]
      .sort((left, right) => left.name.localeCompare(right.name, "sv-SE")));
    selectRecipient(recipient.id, recipient.iban);
    setRecipientSaveMessage(`${recipient.name} har sparats och valts som mottagare.`);
    setIsRecipientDialogOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (role === "attestant") {
      setSubmitError(PAYMENT_PERMISSION_ERROR);
      setCreatedPayment(null);
      return;
    }

    if (
      paymentForm.fromAccountId === 0 ||
      !paymentForm.toIban.trim() ||
      !paymentForm.amount.trim()
    ) {
      setSubmitError("Välj konto, ange IBAN och belopp.");
      setCreatedPayment(null);
      return;
    }

    const amount = parsePaymentAmount(paymentForm.amount);
    if (amount === null) {
      setSubmitError(PAYMENT_AMOUNT_ERROR);
      setCreatedPayment(null);
      return;
    }

    const paymentToCreate: CreatePaymentRequest = {
      fromAccountId: paymentForm.fromAccountId,
      toIban: paymentForm.toIban.replace(/\s/g, "").toUpperCase(),
      amount,
      reference: paymentForm.reference?.trim() || undefined,
    };

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setCreatedPayment(null);
      setIsPaymentConfirmationOpen(false);

      const payment = await createPayment(paymentToCreate);

      setCreatedPayment(payment);
      setIsPaymentConfirmationOpen(true);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Kunde inte skapa betalningen. Försök igen."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleAccountChange(event: ChangeEvent<HTMLSelectElement>) {
    const selectedAccountId = event.target.value
      ? Number(event.target.value)
      : 0;

    setPaymentForm((currentForm) => ({
      ...currentForm,
      fromAccountId: selectedAccountId,
    }));
    setSubmitError(null);
    setCreatedPayment(null);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;

    if (name === "toIban") {
      setSelectedRecipientId("");
      setRecipientSaveMessage(null);
    }
    setPaymentForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
    setSubmitError(null);
    setCreatedPayment(null);
  }

  return (
    <div className="dashboard-layout new-payment-layout">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((isOpen) => !isOpen)}
        onClose={() => setIsSidebarOpen(false)}
      />

      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? " is-open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Stäng meny"
      />

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-title">
            <h1>Betalningar</h1>
            <p>Skapa en ny betalning</p>
          </div>

          <div className="dashboard-header-actions">
            <div className="search-input-wrapper">
              <FiSearch className="dashboard-search-icon" />
              <input
                type="search"
                placeholder="Sök betalningar, konton..."
                aria-label="Sök betalningar och konton"
              />
            </div>

            <button
              className="dashboard-notification-button"
              type="button"
              aria-label="Notifikationer"
            >
              <FiBell className="dashboard-notification-icon" />
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          <section
            className="new-payment-content"
            aria-labelledby="new-payment-title"
          >
            <Link to="/payments" className="new-payment-back">
              <FiArrowLeft aria-hidden="true" />
              Tillbaka
            </Link>
            <Card className="new-payment-card">
              <div className="new-payment-card-header">
                <h2 id="new-payment-title">Skapa betalning</h2>
              </div>

              {role === "attestant" && (
                <div className="new-payment-role-notice" role="status">
                  <p>{PAYMENT_PERMISSION_ERROR}</p>
                  <Link to="/">Byt användare</Link>
                </div>
              )}

              <form className="new-payment-form" onSubmit={handleSubmit} autoComplete="off">
                <div className="new-payment-field">
                  <label htmlFor="from-account">Konto</label>
                  <select
                    id="from-account"
                    name="fromAccountId"
                    value={
                      paymentForm.fromAccountId === 0
                        ? ""
                        : String(paymentForm.fromAccountId)
                    }
                    onChange={handleAccountChange}
                    disabled={isLoadingAccounts}
                    required
                  >
                    <option value="">
                      {isLoadingAccounts ? "Laddar konton..." : "Välj konto"}
                    </option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {`${account.accountName} - ${account.iban} (${account.currency})`}
                      </option>
                    ))}
                  </select>
                  {accountLoadError ? (
                    <small role="alert">{accountLoadError}</small>
                  ) : null}
                </div>

                <div className="new-payment-field new-payment-recipient-field">
                  <div className="new-payment-recipient-heading">
                    <label htmlFor="saved-recipient">Mottagare</label>
                    <div className="new-payment-recipient-controls">
                      <Button type="button" className="new-payment-recipient-retry" onClick={refreshRecipients} disabled={isLoadingRecipients}>Uppdatera mottagare</Button>
                      {canAddRecipients && (
                        <Button
                          type="button"
                          className="new-payment-add-recipient"
                          disabled={isLoadingRecipients || !demoConfirmationEnabled || isSubmitting}
                          onClick={() => { setRecipientSaveMessage(null); setIsRecipientDialogOpen(true); }}
                          aria-haspopup="dialog"
                          aria-describedby={!demoConfirmationEnabled ? "recipient-add-availability" : undefined}
                        >
                          <FiPlus aria-hidden="true" />Lägg till mottagare
                        </Button>
                      )}
                    </div>
                  </div>
                  <select
                    id="saved-recipient"
                    value={selectedRecipient ? String(selectedRecipient.value) : ""}
                    disabled={isLoadingRecipients || recipientOptions.length === 0}
                    onChange={(event) => {
                      const recipient = recipientOptions.find((item) => String(item.value) === event.target.value);
                      setRecipientSaveMessage(null);
                      if (recipient) selectRecipient(recipient.value, recipient.iban);
                      else setSelectedRecipientId("");
                    }}
                  >
                    <option value="">{isLoadingRecipients ? "Laddar mottagare..." : "Ange IBAN manuellt eller välj mottagare"}</option>
                    {recipientOptions.map((recipient) => (
                      <option key={recipient.value} value={recipient.value}>{recipient.label}</option>
                    ))}
                  </select>
                  {recipientLoadError ? (
                    <div className="new-payment-recipient-feedback">
                      <small role="alert">{recipientLoadError}</small>
                    </div>
                  ) : !isLoadingRecipients && !isLoadingHistory && recipientOptions.length === 0 ? (
                    <small>Inga sparade mottagare ännu. Du kan ange IBAN manuellt nedan.</small>
                  ) : null}
                  {isLoadingHistory && <small role="status">Hämtar tidigare godkända mottagare...</small>}
                  {historyLoadError && <small role="status">{historyLoadError}</small>}
                  {canAddRecipients && !demoConfirmationEnabled && (
                    <small id="recipient-add-availability">{isLoadingRecipients
                      ? "Hämtar tillgänglighet för att lägga till mottagare..."
                      : recipientLoadError
                        ? "Uppdatera mottagarlistan för att kontrollera om mottagare kan läggas till."
                        : "Att lägga till mottagare med demobekräftelse är inte aktiverat i den här miljön."}</small>
                  )}
                  {recipientSaveMessage && <small role="status">{recipientSaveMessage}</small>}
                </div>

                <div className="new-payment-field">
                  <label htmlFor="recipient-iban">Mottagare / IBAN</label>
                  {selectedRecipient ? (
                    <>
                      <output id="recipient-iban" htmlFor="saved-recipient" aria-describedby="recipient-manual-entry-help">{paymentForm.toIban}</output>
                      <small id="recipient-manual-entry-help">Välj Ange IBAN manuellt i listan ovan för att ändra IBAN.</small>
                    </>
                  ) : (
                    <input
                      id="recipient-iban"
                      name="toIban"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder="SE00 0000 0000 0000 0000 0000"
                      maxLength={34}
                      value={paymentForm.toIban}
                      onChange={handleInputChange}
                      required
                    />
                  )}
                </div>

                <div className="new-payment-field">
                  <label htmlFor="amount">Belopp</label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={paymentForm.amount}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="new-payment-field">
                  <label htmlFor="reference">Referens</label>
                  <input
                    id="reference"
                    name="reference"
                    type="text"
                    placeholder="Faktura #1234"
                    maxLength={100}
                    value={paymentForm.reference ?? ""}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="new-payment-actions">
                  <Button
                    type="submit"
                    className="new-payment-submit"
                    disabled={isSubmitting || role === "attestant"}
                  >
                    {isSubmitting ? "Skapar betalning..." : "Skapa betalning"}
                  </Button>
                </div>

                {createdPayment ? (
                  <small role="status">
                    {getPaymentSuccessMessage(createdPayment)}
                  </small>
                ) : null}

                {submitError ? <small role="alert">{submitError}</small> : null}
              </form>
            </Card>
          </section>
        </div>
      </main>
      {isRecipientDialogOpen && canAddRecipients && demoConfirmationEnabled && (
        <NewRecipientDialog onClose={() => setIsRecipientDialogOpen(false)} onSaved={handleRecipientSaved} />
      )}
      {createdPayment && isPaymentConfirmationOpen && (
        <PaymentConfirmationDialog payment={createdPayment} onClose={() => setIsPaymentConfirmationOpen(false)} />
      )}
    </div>
  );
}

function getPaymentSuccessMessage(payment: CreatePaymentResponse): string {
  if (payment.status === "pending_approval") {
    return `Betalning skapad och väntar på godkännande. ID ${payment.id}.`;
  }

  return `Betalning skapad och genomförd. ID ${payment.id}.`;
}

export default NewPayment;
