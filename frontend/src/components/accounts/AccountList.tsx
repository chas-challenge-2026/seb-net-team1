import Card from "../shared/Card";
import AccountRow from "./AccountRow";
import type { Account } from "../../types/Account";

type AccountListProps = {
  accounts: Account[] | null;
};

const AccountList = ({ accounts }: AccountListProps) => {

  return (
    <section className="account-list">
      <Card className="account-list-card">
        <div className="account-list-header">
          <div>
            <h2>Företagets konton</h2>
            <p>Översikt över företagets konton och aktuella saldon.</p>
          </div>
        </div>

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
