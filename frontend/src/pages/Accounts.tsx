import { useState } from "react";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import AccountSummary from "../components/accounts/AccountSummary";
import AccountList from "../components/accounts/AccountList";


const Accounts = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="dashboard-layout">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((isOpen) => !isOpen)}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="dashboard-content">
        <DashboardHeader
          user={{
            id: 1,
            tenantId: 1,
            name: "Användarnamn",
            email: "anvandarnamn@seb.se",
            role: "admin",
          }}
          onSearch={(value) => console.log("Sökning:", value)}
          onNotificationClick={() => console.log("Notifikationer klickade")}
        />

        <main className="accounts-main">
          <div className="accounts-header">
            <div>
              <h1>Konton</h1>
              <p>Här ser du samlad bild av företagets konton och saldo.</p>
            </div>
          </div>

          <div className="accounts-layout">
            <section className="accounts-content">
                <AccountSummary />
                <AccountList />
            </section>

            <aside className="accounts-aside">
              {/* TODO: Lägg till den extra informationen */}
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Accounts;
