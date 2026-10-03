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

function Dashboard() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
      .catch(() => {
        if (isCurrent) {
          setDashboardError("Kunde inte hämta dashboardens mockdata. Kontrollera att mock-API:t körs.");
        }
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
        <DashboardHeader user={dashboardData?.user ?? null} />

        <div className="dashboard-content">
          {dashboardError && (
            <p className="dashboard-data-error" role="alert">
              {dashboardError}
            </p>
          )}

          <DashboardSummary data={dashboardData} />

          <section className="dashboard-overview-grid">
            <AccountOverview accounts={dashboardData?.accounts ?? null} />
            <PaymentStatus counts={dashboardData?.paymentStatusCounts ?? null} />
          </section>

          <section className="dashboard-lower-grid">
            <PendingApprovals approvals={dashboardData?.pendingApprovals ?? null} />
            <UpcomingPayments payments={dashboardData?.upcomingPayments ?? null} />
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