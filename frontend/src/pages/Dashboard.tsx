import { useState } from "react";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import DashboardSummary from "../components/dashboard/DashboardSummary";
import AccountOverview from "../components/dashboard/AccountOverview";
import PaymentStatus from "../components/dashboard/PaymentStatus";
import UpcomingPayments from "../components/dashboard/UpcomingPayments";
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
        <DashboardSummary />
        <section className="dashboard-overview-grid">
          <AccountOverview />
          <PaymentStatus />
        </section>
        <UpcomingPayments />
      </main>
    </div>
  );
}

export default Dashboard;