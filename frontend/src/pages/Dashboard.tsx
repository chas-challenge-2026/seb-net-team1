import DashboardHeader from "../components/dashboard/DashboardHeader";
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
    <div>
      <DashboardHeader user={user} />
    </div>
  );
}

export default Dashboard;