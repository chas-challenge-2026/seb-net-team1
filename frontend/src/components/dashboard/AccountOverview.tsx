import { useEffect, useState } from "react";
import { LuBuilding2, LuArrowRight } from "react-icons/lu";
import Card from "../shared/Card";

interface Account {
  id: number;
  accountName: string;
  iban: string;
  balance: number;
  currency: string;
}

export default function AccountOverview() {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    fetch("http://localhost:3001/accounts")
      .then((response) => response.json())
      .then((data) => setAccounts(data))
      .catch((error) => {
        console.error("Kunde inte hämta konton:", error);
      });
  }, []);

  return (
    <Card className="account-overview">
      <div className="dashboard-section__header">
        <h2>Konton</h2>

        <button className="dashboard-section__link">
          Visa alla konton
          <LuArrowRight />
        </button>
      </div>

      <div className="account-overview__grid">
        {accounts.map((account) => (
          <div className="account-card" key={account.id}>
            <div className="account-card__top">
              <div
                className={`account-card__icon account-card__icon--${account.id}`}
              >
                <LuBuilding2 />
              </div>

              <div>
                <h3>{account.accountName}</h3>

                <span className="account-card__iban">
                  •••• {account.iban.slice(-4)}
                </span>
              </div>
            </div>

            <div className="account-card__balance">
              <span>Aktuellt saldo</span>

              <strong>
                {account.balance.toLocaleString("sv-SE")}{" "}
                {account.currency}
              </strong>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}