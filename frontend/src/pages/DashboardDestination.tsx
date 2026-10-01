import { useState } from "react";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import Card from "../components/shared/Card";
import type { User } from "../types/User";

interface DashboardDestinationProps {
  title: string;
  subtitle: string;
}

const user: User = {
  id: 1,
  tenantId: 1,
  name: "Anna Andersson",
  email: "anna@foretag.se",
  role: "Admin",
};

export default function DashboardDestination({
  title,
  subtitle,
}: DashboardDestinationProps) {
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
        <DashboardHeader user={user} title={title} subtitle={subtitle} />

        <div className="dashboard-content">
          <Card className="dashboard-destination-card">
            <h2>{title}</h2>
            <p>Innehållet för den här sidan är inte tillgängligt ännu.</p>
          </Card>
        </div>
      </main>
    </div>
  );
}