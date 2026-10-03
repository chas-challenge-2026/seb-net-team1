import { LuBuilding2, LuArrowRight } from "react-icons/lu";
import { Link } from "react-router-dom";
import Card from "../shared/Card";
import type { DashboardAccount } from "../../api/dashboardApi";

interface AccountOverviewProps {
  accounts: DashboardAccount[] | null;
}

export default function AccountOverview({ accounts }: AccountOverviewProps) {

  return (
    <Card className="account-overview">
      <div className="dashboard-section__header">
        <h2>Konton</h2>

        <Link to="/accounts" className="dashboard-section__link">
           Visa alla konton
          <LuArrowRight />
        </Link>
      </div>

      <div className="account-overview__grid">
        {accounts === null ? (
          <p className="account-overview__empty">Hämtar konton...</p>
        ) : accounts.length === 0 ? (
          <p className="account-overview__empty">Inga konton att visa.</p>
        ) : accounts.map((account) => (
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