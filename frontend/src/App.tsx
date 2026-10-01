import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import "./styles/global.css";
import Dashboard from "./pages/Dashboard";
import NewPayment from "./pages/NewPayment";
import Accounts  from "./pages/Accounts";
import DashboardDestination from "./pages/DashboardDestination";

const pageTitles: Record<string, string> = {
  "/": "Logga in",
  "/dashboard": "Översikt",
  "/new-payment": "Betalningar",
  "/accounts": "Konton",
  "/approval-inbox": "Godkännanden",
  "/batch-upload": "Batchfiler",
  "/reports": "Rapporter",
  "/audit-log": "Audit-logg",
  "/settings": "Inställningar",
};

function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = `${pageTitles[pathname] ?? "Cash Management"} | SEB`;
  }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/new-payment" element={<NewPayment />} />
      <Route path="/accounts" element={<Accounts />}/>
      <Route
        path="/approval-inbox"
        element={
          <DashboardDestination
            title="Godkännanden"
            subtitle="Granska och hantera betalningar som väntar på godkännande."
          />
        }
      />
      <Route
        path="/batch-upload"
        element={
          <DashboardDestination
            title="Batchfiler"
            subtitle="Hantera betalningar som importerats från fil."
          />
        }
      />
      <Route
        path="/reports"
        element={
          <DashboardDestination
            title="Rapporter"
            subtitle="Följ upp betalningar och valideringsavvikelser."
          />
        }
      />
      <Route
        path="/audit-log"
        element={
          <DashboardDestination
            title="Audit-logg"
            subtitle="Se loggade händelser och betalningsaktivitet."
          />
        }
      />
    </Routes>
  );
}

export default App;
