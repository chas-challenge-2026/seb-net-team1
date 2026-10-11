import {
  LuWallet,
  LuCircleDollarSign,
  LuBuilding2,
} from "react-icons/lu";
import Card from "../shared/Card";
import type { Account } from "../../types/Account";

type AccountSummaryProps = {
  accounts: Account[] | null;
};

const AccountSummary = ({ accounts }: AccountSummaryProps) => {
  const sekBalance = accounts?.reduce((total, account) => {
    if (account.currency !== "SEK") return total;
    const balance = Number(account.balance);
    return total + (Number.isFinite(balance) ? balance : 0);
  }, 0);
  const currencies = new Set(accounts?.map((account) => account.currency) ?? []);
  const formatBalance = (balance: number | undefined) =>
    balance === undefined
      ? "—"
      : `${balance.toLocaleString("sv-SE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} kr`;

  return (
    <section className="account-summary">
      <Card className="account-summary-card">
        <div className="account-summary-item">
          <div className="account-summary-icon">
            <LuWallet />
          </div>
          <div className="account-summary-copy">
            <p>Totalt saldo</p>
            <h2>{formatBalance(sekBalance)}</h2>
          </div>
        </div>
      </Card>

      <Card className="account-summary-card">
        <div className="account-summary-item">
          <div className="account-summary-icon">
            <LuCircleDollarSign />
          </div>
          <div className="account-summary-copy">
            <p>Valutor</p>
            <h2>{accounts ? currencies.size : "—"}</h2>
          </div>
        </div>
      </Card>

      <Card className="account-summary-card">
        <div className="account-summary-item">
          <div className="account-summary-icon">
            <LuBuilding2 />
          </div>
          <div className="account-summary-copy">
            <p>Antal konton</p>
            <h2>{accounts ? accounts.length : "—"}</h2>
          </div>
        </div>
      </Card>
    </section>
  );
};

export default AccountSummary;
