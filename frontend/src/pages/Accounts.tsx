import { useEffect, useState } from "react";
import { getAccounts } from "../api/accountsApi";
import type { Account } from "../types/Account";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import AccountSummary from "../components/accounts/AccountSummary";
import AccountList from "../components/accounts/AccountList";
import Card from "../components/shared/Card";
import {
  LuArrowRight,
  LuExternalLink,
  LuCircleHelp,
  LuShieldCheck,
} from "react-icons/lu";
import "../styles/dashboard.css";
import "../styles/accounts.css";

const Accounts = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    getAccounts()
      .then((data) => {
        if (isCurrent) setAccounts(data);
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;

        setAccountsError(
          error instanceof TypeError
            ? "Kunde inte nå backend-API:t. Kontrollera anslutningen och försök igen."
            : error instanceof Error
              ? error.message
              : "Kunde inte hämta konton."
        );
      });

    return () => {
      isCurrent = false;
    };
  }, []);

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
        />

        <div className="dashboard-content">
          {accountsError && (
            <p className="dashboard-data-error" role="alert">
              {accountsError}
            </p>
          )}

          <div className="accounts-main">
            <section className="accounts-content">
              <AccountSummary accounts={accounts} />
              <AccountList accounts={accounts} />
            </section>

            <aside className="accounts-aside">
              <Card className="account-info-card">
                <div className="account-info-header">
                  <LuCircleHelp />
                  <h2>Bra att veta</h2>
                </div>

                <p>
                  Här kan du se företagets konton, aktuellt saldo och
                  kontouppgifter.
                </p>

                <a
                  href="https://seb.se/foretag/betalningar-konton-och-kort/konton/foretagskonto"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="account-info-link"
                >
                  Läs mer om företagskonton
                  <LuExternalLink />
                </a>
              </Card>

              <Card className="account-info-card">
                <div className="account-info-header">
                  <LuCircleHelp />
                  <h2>Behöver du hjälp?</h2>
                </div>

                <p>
                  Besök SEB.se för mer information om företagets konton och
                  tjänster.
                </p>

                <a
                  href="https://seb.se/foretag"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="account-info-link"
                >
                  Besök SEB.se
                  <LuExternalLink />
                </a>
              </Card>

              <Card className="account-security-card">
                <div className="account-info-header">
                  <LuShieldCheck />
                  <h2>Säkerhet</h2>
                </div>
                <p>
                  Vi skyddar dina transaktioner med högsta säkerhet och full
                  spårbarhet.
                </p>
                <a
                  href="https://seb.se/juridik-och-sakerhet/informationssakerhet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="account-info-link"
                >
                  Läs mer <LuArrowRight aria-hidden="true" />
                </a>
              </Card>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Accounts;
