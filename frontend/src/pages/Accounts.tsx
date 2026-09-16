import { useState } from "react";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import AccountSummary from "../components/accounts/AccountSummary";
import AccountList from "../components/accounts/AccountList";
import "../styles/dashboard.css";
import "../styles/accounts.css";

const Accounts = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="dashboard-layout">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((isOpen) => !isOpen)}
        onClose={() => setIsSidebarOpen(false)}
      />

      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? " is-open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Stäng meny"
      />

      <main className="dashboard-main">
        <DashboardHeader
          title="Konton"
          subtitle="Här ser du en samlad bild av företagets konton och saldo."
          user={{
            id: 1,
            tenantId: 1,
            name: "Användarnamn",
            email: "anvandarnamn@seb.se",
            role: "admin",
          }}
        />

        <div className="dashboard-content">
          <div className="accounts-main">
            <section className="accounts-content">
              <AccountSummary />
              <AccountList />
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Accounts;
