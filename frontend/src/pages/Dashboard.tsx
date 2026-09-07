import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import "../styles/dashboard.css";

function Dashboard() {
  const user = {
    id: 1,
    tenantId: 1,
    name: "Anna Andersson",
    email: "anna@foretag.se",
    role: "Admin",
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="dashboard-main">
        <DashboardHeader user={user} />
      </main>
    </div>
  );
}

export default Dashboard;