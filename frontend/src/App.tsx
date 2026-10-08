import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import "./styles/global.css";
import Dashboard from "./pages/Dashboard";
import NewPayment from "./pages/NewPayment";
import Accounts  from "./pages/Accounts";
import BatchFiles from "./pages/BatchFiles";
import AuditLog from "./pages/AuditLog";
import Payments from "./pages/Payments";
import PaymentDetails from "./pages/PaymentDetails";

const pageTitles: Record<string, string> = {
  "/": "Logga in",
  "/dashboard": "Översikt",
  "/new-payment": "Betalningar",
  "/payments": "Betalningar",
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
    const title = pathname.startsWith("/payments/")
      ? "Betalningar – Detaljer"
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
      <Route path="/batch-upload" element={<BatchFiles />} />
      <Route path="/audit-log" element={<AuditLog />} />
      {/* TODO: Lägg till React-routes när sidorna för godkännanden och rapporter har flyttats hit. */}
    </Routes>
  );
}

export default App;
