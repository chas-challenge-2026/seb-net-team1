import Card from "../shared/Card";
import AccountRow from "./AccountRow";

const AccountList = () => {
  const accounts = [
    {
      id: 1,
      name: "Driftkonto",
      iban: "SE45 5000 0000 0583 9825 7466",
      balance: "2 500 000 kr",
      currency: "SEK",
    },
    {
      id: 2,
      name: "Lönekonto",
      iban: "SE45 5000 0000 0583 9825 7467",
      balance: "890 000 kr",
      currency: "SEK",
    },
    {
      id: 3,
      name: "Projektkonto",
      iban: "SE45 5000 0000 0583 9825 7468",
      balance: "450 000 kr",
      currency: "SEK",
    },
  ];

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
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </div>
      </Card>
    </section>
  );
};

export default AccountList;