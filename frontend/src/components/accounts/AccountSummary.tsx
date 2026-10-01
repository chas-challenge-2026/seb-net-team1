import {
  LuWallet,
  LuCircleDollarSign,
  LuBuilding2,
} from "react-icons/lu";
import Card from "../shared/Card";

const AccountSummary = () => {

  // TODO: Ersätt hårdkoden med data från API:t senare

  return (
    <section className="account-summary">
      <Card className="account-summary-card">
        <div className="account-summary-item">
          <div className="account-summary-icon">
            <LuWallet />
          </div>
          <div className="account-summary-copy">
            <p>Totalt saldo</p>
            <h2>1 245 800 kr</h2>
          </div>
        </div>
      </Card>

      <Card className="account-summary-card">
        <div className="account-summary-item">
          <div className="account-summary-icon">
            <LuCircleDollarSign />
          </div>
          <div className="account-summary-copy">
            <p>Tillgängligt saldo</p>
            <h2>1 198 400 kr</h2>
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
            <h2>3</h2>
          </div>
        </div>
      </Card>
    </section>
  );
};

export default AccountSummary;