import type { FormEvent } from "react";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import "../styles/newPayment.css";

function NewPayment() {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <main className="new-payment-page">
      <section className="new-payment-content" aria-labelledby="new-payment-title">
        <div className="new-payment-header">
          <h1 id="new-payment-title">Skapa betalning</h1>
        </div>

        <Card className="new-payment-card">
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
    </main>
  );
}

export default NewPayment;
