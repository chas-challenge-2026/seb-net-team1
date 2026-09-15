import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import "./styles/global.css";
import Dashboard from "./pages/Dashboard";
import NewPayment from "./pages/NewPayment";
import Accounts  from "./pages/Accounts";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/new-payment" element={<NewPayment />} />
      <Route path="/accounts" element={<Accounts />}/>
    </Routes>
  );
}

export default App;
