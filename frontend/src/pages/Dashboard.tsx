import { useState } from "react";
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

  const user = {
    id: 1,
    tenantId: 1,
    name: "Anna Andersson",
    email: "anna@foretag.se",
    role: "Admin",
  };

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
        <DashboardHeader user={user} />

        <div className="dashboard-content">
          <DashboardSummary />

          <section className="dashboard-panels" aria-label="Dashboardöversikt">
            <div className="dashboard-column">
              <AccountOverview />
              <PendingApprovals />
              <RecentActivity />
            </div>

            <div className="dashboard-column">
              <PaymentStatus />
              <UpcomingPayments />
              <QuickActions />
            </div>
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