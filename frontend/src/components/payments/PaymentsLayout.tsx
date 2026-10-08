import { useState } from "react";
import type { ReactNode } from "react";
import DashboardHeader from "../dashboard/DashboardHeader";
import Sidebar from "../dashboard/Sidebar";
import type { PaymentOverview } from "../../types/Payment";
import "../../styles/dashboard.css";
import "../../styles/payments.css";

type PaymentsLayoutProps = {
  title: string;
  subtitle?: string;
  overview: PaymentOverview | null;
  children: ReactNode;
  contentClassName: string;
};

export default function PaymentsLayout({ title, subtitle = "", overview, children, contentClassName }: PaymentsLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="dashboard-layout payments-layout">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((current) => !current)}
        onClose={() => setIsSidebarOpen(false)}
        user={overview?.user}
        tenantName={overview?.tenantName}
        pendingApprovalCount={overview?.pendingApprovalCount}
      />
      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? " is-open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Stäng meny"
      />
      <main className="dashboard-main payments-main">
        <DashboardHeader title={title} subtitle={subtitle} showSearch={false} />
        <div className={`dashboard-content payments-content ${contentClassName}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
