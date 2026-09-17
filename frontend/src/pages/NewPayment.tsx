import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { FiBell, FiSearch } from "react-icons/fi";
import { getAccounts } from "../api/accountsApi";
import { createPayment } from "../api/paymentsApi";
import Sidebar from "../components/dashboard/Sidebar";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import type { Account } from "../types/Account";
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
} from "../types/Payment";
import "../styles/dashboard.css";
import "../styles/newPayment.css";

function NewPayment() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [accountLoadError, setAccountLoadError] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<CreatePaymentRequest>({
    fromAccountId: 0,
    toIban: "",
    amount: "",
    reference: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdPayment, setCreatedPayment] =
    useState<CreatePaymentResponse | null>(null);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
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

    const paymentToCreate: CreatePaymentRequest = {
      fromAccountId: paymentForm.fromAccountId,
      toIban: paymentForm.toIban.trim(),
      amount: paymentForm.amount,
      reference: paymentForm.reference?.trim() || undefined,
    };

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setCreatedPayment(null);

      const payment = await createPayment(paymentToCreate);

      setCreatedPayment(payment);
    } catch {
      setSubmitError("Kunde inte skapa betalningen. Försök igen.");
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

    setPaymentForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));
    setSubmitError(null);
    setCreatedPayment(null);
  }

  return (
    <div className="dashboard-layout">
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
            <Card className="new-payment-card">
              <div className="new-payment-card-header">
                <h2 id="new-payment-title">Skapa betalning</h2>
              </div>

              <form className="new-payment-form" onSubmit={handleSubmit}>
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

                <div className="new-payment-field">
                  <label htmlFor="recipient-iban">Mottagare / IBAN</label>
                  <input
                    id="recipient-iban"
                    name="toIban"
                    type="text"
                    placeholder="SE00 0000 0000 0000 0000 0000"
                    maxLength={34}
                    value={paymentForm.toIban}
                    onChange={handleInputChange}
                    required
                  />
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
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Skapar betalning..." : "Skapa betalning"}
                  </Button>
                </div>

                {createdPayment ? (
                  <small role="status">
                    Betalning skapad i mock-API med ID {createdPayment.id}.
                  </small>
                ) : null}

                {submitError ? <small role="alert">{submitError}</small> : null}
              </form>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

export default NewPayment;
