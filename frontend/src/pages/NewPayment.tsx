import { useState } from "react";
import type { FormEvent } from "react";
import { FiBell, FiSearch } from "react-icons/fi";
import Sidebar from "../components/dashboard/Sidebar";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import "../styles/dashboard.css";
import "../styles/newPayment.css";

function NewPayment() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
                  <select id="from-account" name="fromAccountId" required>
                    <option value="">Välj konto</option>
                  </select>
                </div>

                <div className="new-payment-field">
                  <label htmlFor="recipient-iban">Mottagare / IBAN</label>
                  <input
                    id="recipient-iban"
                    name="toIban"
                    type="text"
                    placeholder="SE00 0000 0000 0000 0000 0000"
                    maxLength={34}
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
                  />
                </div>

                <div className="new-payment-actions">
                  <Button type="submit" className="new-payment-submit">
                    Skapa betalning
                  </Button>
                </div>
              </form>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

export default NewPayment;
