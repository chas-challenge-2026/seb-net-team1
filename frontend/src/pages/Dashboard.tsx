import { useEffect, useState } from "react";
import { getDashboardData } from "../api/dashboardApi";
import type { DashboardData } from "../api/dashboardApi";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import DashboardPromoBanner from "../components/dashboard/DashboardPromoBanner";
import Sidebar from "../components/dashboard/Sidebar";
import DashboardSummary from "../components/dashboard/DashboardSummary";
import AccountOverview from "../components/dashboard/AccountOverview";
import PaymentStatus from "../components/dashboard/PaymentStatus";
import UpcomingPayments from "../components/dashboard/UpcomingPayments";
import PendingApprovals from "../components/dashboard/PendingApprovals";
import RecentActivity from "../components/dashboard/RecentActivity";
import QuickActions from "../components/dashboard/QuickActions";
import "../styles/dashboard.css";

function filterBySearch<T>(
  items: T[] | null,
  query: string,
  getSearchText: (item: T) => string
): T[] | null {
  if (items === null || !query) {
    return items;
  }

  return items.filter((item) =>
    getSearchText(item).toLocaleLowerCase("sv-SE").includes(query)
  );
}

function Dashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    getDashboardData()
      .then((data) => {
        if (isCurrent) {
          setDashboardData(data);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setDashboardError(
            error instanceof TypeError
              ? "Kunde inte nå backend-API:t. Kontrollera anslutningen och försök igen."
              : error instanceof Error
              ? error.message
              : "Kunde inte hämta dashboarddata från API:t."
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase("sv-SE");
  const visibleAccounts = filterBySearch(
    dashboardData?.accounts ?? null,
    normalizedSearchTerm,
    (account) => `${account.accountName} ${account.iban ?? ""} ${account.currency}`
  );
  const visibleApprovals = filterBySearch(
    dashboardData?.pendingApprovals ?? null,
    normalizedSearchTerm,
    (payment) => `${payment.reference} ${payment.toIban ?? ""} ${payment.status}`
  );
  const visibleUpcomingPayments = filterBySearch(
    dashboardData?.upcomingPayments ?? null,
    normalizedSearchTerm,
    (payment) => `${payment.reference} ${payment.toIban ?? ""} ${payment.status}`
  );

  return (
    <div className="dashboard-layout">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((isOpen) => !isOpen)}
        onClose={() => setIsSidebarOpen(false)}
        user={dashboardData?.user}
        tenantName={dashboardData?.tenantName}
        pendingApprovalCount={dashboardData?.pendingApprovals.length}
      />

      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? " is-open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Stäng meny"
      />

      <main className="dashboard-main">
        <DashboardHeader
          user={dashboardData?.user ?? null}
          subtitle={dashboardError ? "Dashboarddata kunde inte hämtas" : undefined}
          onSearch={setSearchTerm}
        />

        <div className="dashboard-content">
          {dashboardError && (
            <p className="dashboard-data-error" role="alert">
              {dashboardError}
            </p>
          )}

          <DashboardSummary data={dashboardData} />

          <section className="dashboard-overview-grid">
            <AccountOverview
              accounts={visibleAccounts}
              searchActive={Boolean(normalizedSearchTerm)}
            />
            <PaymentStatus counts={dashboardData?.paymentStatusCounts ?? null} />
          </section>

          <section className="dashboard-lower-grid">
            <PendingApprovals
              approvals={visibleApprovals}
              searchActive={Boolean(normalizedSearchTerm)}
            />
            <UpcomingPayments
              payments={visibleUpcomingPayments}
              searchActive={Boolean(normalizedSearchTerm)}
            />
          </section>

          <section className="dashboard-lower-grid">
            <RecentActivity activities={dashboardData?.recentActivity ?? null} />
            <QuickActions />
          </section>
        </div>

        <footer className="dashboard-footer">
          <DashboardPromoBanner />
        </footer>
      </main>
    </div>
  );
}

export default Dashboard;