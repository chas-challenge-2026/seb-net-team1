import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import "./styles/global.css";
import Dashboard from "./pages/Dashboard";
import NewPayment from "./pages/NewPayment";
import Accounts  from "./pages/Accounts";
import BatchFiles from "./pages/BatchFiles";
import AuditLog from "./pages/AuditLog";
import ApprovalInbox from "./pages/ApprovalInbox";

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
      <Route path="/batch-upload" element={<BatchFiles />} />
      <Route path="/audit-log" element={<AuditLog />} />
      <Route path="/approval-inbox" element={<ApprovalInbox />} />
      {/* TODO: Lägg till React-route när rapportsidan har flyttats hit. */}
    </Routes>
  );
}

export default App;
