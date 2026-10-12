import { LuBuilding2 } from "react-icons/lu";
import type { Account } from "../../types/Account";

type AccountRowProps = {
  account: Account;
};

const AccountRow = ({ account }: AccountRowProps) => {
  return (
    <article className="account-row">
      <div className="account-row-icon">
        <LuBuilding2 />
      </div>

      <div className="account-row-info">
        <h3>{account.accountName}</h3>
        <p>{account.iban}</p>
      </div>

      <div className="account-row-balance">
        <span>Aktuellt saldo</span>
        <strong>
          {Number(account.balance).toLocaleString("sv-SE", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </strong>
        <span>{account.currency}</span>
      </div>
    </article>
  );
};

export default AccountRow;
