import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import "./styles/global.css";
import Dashboard from "./pages/Dashboard";
import NewPayment from "./pages/NewPayment";
import Accounts  from "./pages/Accounts";
import BatchFiles from "./pages/BatchFiles";
import BatchFilesOverview from "./pages/BatchFilesOverview";
import BatchFileDetails from "./pages/BatchFileDetails";
import BatchLayout from "./components/batch/BatchLayout";
import AuditLog from "./pages/AuditLog";
import ApprovalInbox from "./pages/ApprovalInbox";
import Reports from "./pages/Reports";
import Payments from "./pages/Payments";
import PaymentDetails from "./pages/PaymentDetails";
import Settings from "./pages/Settings";
import Logout from "./pages/Logout";

const pageTitles: Record<string, string> = {
  "/": "Logga in",
  "/dashboard": "Översikt",
  "/new-payment": "Betalningar",
  "/payments": "Betalningar",
  "/accounts": "Konton",
  "/approval-inbox": "Godkännanden",
  "/batch-upload": "Batchfiler",
  "/batch-files": "Batchfiler",
  "/reports": "Rapporter",
  "/audit-log": "Audit-logg",
  "/settings": "Inställningar",
  "/logout": "Utloggad",
};

function App() {
  const { pathname } = useLocation();

  useEffect(() => {
    const title = pathname.startsWith("/payments/")
      ? "Betalningar – Detaljer"
      : pathname.startsWith("/batch-files/")
        ? "Batchfil – detaljer"
        : pageTitles[pathname] ?? "Cash Management";
    document.title = `${title} | SEB`;
  }, [pathname]);

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/new-payment" element={<NewPayment />} />
      <Route path="/payments" element={<Payments />} />
      <Route path="/payments/:id" element={<PaymentDetails />} />
      <Route path="/accounts" element={<Accounts />}/>
      <Route element={<BatchLayout />}>
        <Route path="/batch-files" element={<BatchFilesOverview />} />
        <Route path="/batch-files/:batchId" element={<BatchFileDetails />} />
        <Route path="/batch-upload" element={<BatchFiles />} />
      </Route>
      <Route path="/audit-log" element={<AuditLog />} />
      <Route path="/approval-inbox" element={<ApprovalInbox />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/logout" element={<Logout />} />
    </Routes>
  );
}

export default App;
