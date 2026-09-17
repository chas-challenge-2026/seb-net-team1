import { LuBuilding2, LuChevronRight } from "react-icons/lu";

type Account = {
  id: number;
  name: string;
  iban: string;
  balance: string;
  currency: string;
};

type AccountRowProps = {
  account: Account;
};

const AccountRow = ({ account }: AccountRowProps) => {
  return (
    <div className="account-row">
      <div className="account-row-icon">
        <LuBuilding2 />
      </div>

      <div className="account-row-info">
        <h3>{account.name}</h3>
        <p>{account.iban}</p>
      </div>

      <div className="account-row-balance">
        <strong>{account.balance}</strong>
        <span>{account.currency}</span>
      </div>

      <button className="account-row-action" type="button">
        <LuChevronRight />
      </button>
    </div>
  );
};

export default AccountRow;