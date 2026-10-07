import { useState } from "react";
import type { ReactNode } from "react";
import { FiSearch } from "react-icons/fi";
import DashboardHeader from "../dashboard/DashboardHeader";
import Sidebar from "../dashboard/Sidebar";
import type { PaymentOverview } from "../../types/Payment";
import "../../styles/dashboard.css";
import "../../styles/payments.css";

type PaymentsLayoutProps = {
  title: string;
  overview: PaymentOverview | null;
  children: ReactNode;
  contentClassName: string;
};

export default function PaymentsLayout({ title, overview, children, contentClassName }: PaymentsLayoutProps) {
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
        <div className="payments-header">
          <DashboardHeader title={title} subtitle="" showSearch={false} />
          <div className="payments-header-search" title="Betalningssökning är inte tillgänglig">
            <FiSearch aria-hidden="true" />
            <input type="search" placeholder="Sök betalningar, konton..." aria-label="Sök betalningar och konton, ej tillgängligt" disabled />
          </div>
        </div>
        <div className={`dashboard-content payments-content ${contentClassName}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
