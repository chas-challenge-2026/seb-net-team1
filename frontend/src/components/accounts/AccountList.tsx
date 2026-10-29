import Card from "../shared/Card";
import AccountRow from "./AccountRow";
import AccountBalanceChart from "./AccountBalanceChart";
import type { Account } from "../../types/Account";

type AccountListProps = {
  accounts: Account[] | null;
};

const AccountList = ({ accounts }: AccountListProps) => {

  return (
    <section className="account-list">
      <Card className="account-list-card">
        {accounts && accounts.length > 0 && <AccountBalanceChart accounts={accounts} />}

        <div className="account-list-items">
          {accounts === null ? (
            <p className="account-list-empty">Hämtar konton...</p>
          ) : accounts.length === 0 ? (
            <p className="account-list-empty">Inga konton att visa.</p>
          ) : accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </div>
      </Card>
    </section>
  );
};

export default AccountList;
