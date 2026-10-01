import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import "./styles/global.css";
import Dashboard from "./pages/Dashboard";
import NewPayment from "./pages/NewPayment";
import Accounts  from "./pages/Accounts";
import PortalSection from "./pages/PortalSection";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/new-payment" element={<NewPayment />} />
      <Route path="/accounts" element={<Accounts />}/>
      <Route path="/payments" element={<PortalSection key="payments" section="payments" />} />
      <Route path="/approvals" element={<PortalSection key="approvals" section="approvals" />} />
      <Route path="/batch-files" element={<PortalSection key="batches" section="batches" />} />
      <Route path="/reports" element={<PortalSection key="reports" section="reports" />} />
      <Route path="/audit-log" element={<PortalSection key="audit" section="audit" />} />
      <Route path="/settings" element={<PortalSection key="settings" section="settings" />} />
    </Routes>
  );
}

export default App;
