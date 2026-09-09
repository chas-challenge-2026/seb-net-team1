import { useEffect, useState } from "react";
import {LuWalletCards,LuCircleCheck,LuArrowUpRight,LuTriangleAlert,} from "react-icons/lu";
import Card from "../shared/Card";

interface Account {
    id: number;
    tenantId: number;
    accountNumber: string;
    iban: string;
    balance: number;
    currency: string;
}

interface Payment {
    id: number;
    tenantId: number;
    fromAccountId: number;
    toIban: string;
    bic: string;
    amount: number;
    currency: string;
    reference: string;
    status: string;
    createdAt: string;
    executedAt: string | null;
}

interface IbanValidation {
  id: number;
  paymentId: number;
  iban: string;
  bic: string;
  ibanValid: boolean;
  bicValid: boolean;
  validatedAt: string;
}

export default function DashboardSummary() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [validations, setValidations] = useState<IbanValidation[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("http://localhost:3001/accounts").then((response) =>
        response.json()
      ),
      fetch("http://localhost:3001/payments").then((response) =>
        response.json()
      ),
      fetch("http://localhost:3001/ibanValidations").then((response) =>
        response.json()
      ),
    ])
      .then(([accountsData, paymentsData, validationsData]) => {
        setAccounts(accountsData);
        setPayments(paymentsData);
        setValidations(validationsData);
      })
      .catch((error) => {
        console.error("Kunde inte hämta dashboard-data:", error);
      });
  }, []);

  const totalBalance = accounts.reduce(
    (total, account) => total + account.balance,
    0
  );

  const pendingApprovals = payments.filter(
    (payment) => payment.status === "pending_approval"
  ).length;

  const totalPayments = payments.length;

  const validationErrors = validations.filter(
    (validation) => !validation.ibanValid || !validation.bicValid
  ).length;

return (
    <section className="dashboard-summary">
      <Card className="summary-card">
        <div className="summary-card__icon">
			<LuWalletCards />
		</div>

        <span className="summary-card__label">Totalt saldo (SEK)</span>
        <strong className="summary-card__value">
          {totalBalance.toLocaleString("sv-SE")} kr
        </strong>

        <span className="summary-card__description">
          Alla företagets konton
        </span>
      </Card>

      <Card className="summary-card">
        <div className="summary-card__icon">
          <LuCircleCheck />
        </div>

        <span className="summary-card__label">
          Väntande godkännanden
        </span>

        <strong className="summary-card__value">
          {pendingApprovals} st
        </strong>

        <span className="summary-card__description">
          Betalningar kräver godkännande
        </span>
      </Card>

      <Card className="summary-card">
        <div className="summary-card__icon">
          <LuArrowUpRight />
        </div>

        <span className="summary-card__label">
          Betalningar
        </span>

        <strong className="summary-card__value">
          {totalPayments} st
        </strong>

        <span className="summary-card__description">
          Totalt registrerade betalningar
        </span>
      </Card>

      <Card className="summary-card">
        <div className="summary-card__icon">
          <LuTriangleAlert />
        </div>

        <span className="summary-card__label">
          Valideringsavvikelser
        </span>

        <strong className="summary-card__value">
          {validationErrors} st
        </strong>

        <span className="summary-card__description">
          Fel i IBAN eller BIC
        </span>
      </Card>
    </section>
  );
}