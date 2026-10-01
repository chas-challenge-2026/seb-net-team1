import "../../styles/dashboard.css";
import logo from "../../assets/seb_logo_white.png";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { getMockRows } from "../../api/mockApi";
import { logout } from "../../api/usersApi";
import {
  FiHome,
  FiCreditCard,
  FiCheckSquare,
  FiBriefcase,
  FiFileText,
  FiBarChart2,
  FiActivity,
  FiSettings,
  FiLogOut,
  FiMenu,
  FiX,
} from "react-icons/fi";

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}

export default function DashboardSidebar({
  isOpen = false,
  onToggle,
  onClose,
}: SidebarProps){
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [logoutError, setLogoutError] = useState("");
    const overviewClassName = `dashboard-sidebar-link${pathname === "/dashboard" ? " active" : ""}`;
    const paymentsClassName = `dashboard-sidebar-link${(pathname === "/new-payment" || pathname === "/payments") ? " active" : ""}`;
    const accountsClassName = `dashboard-sidebar-link${pathname === "/accounts" ? " active" : ""}`;

    const [pendingCount, setPendingCount] = useState<number | null>(null);
    useEffect(() => {
      const controller = new AbortController();
      getMockRows<{ status: string }>("approvalSteps", controller.signal)
        .then(steps => setPendingCount(steps.filter(step => step.status === "pending").length))
        .catch(() => {});
      return () => controller.abort();
    }, []);

    async function handleLogout() {
      setIsLoggingOut(true);
      setLogoutError("");

      try {
        await logout();
        localStorage.removeItem("user");
        navigate("/", { replace: true });
      } catch {
        setLogoutError("Kunde inte logga ut. Försök igen.");
      } finally {
        setIsLoggingOut(false);
      }
    }

    return (
      <>
        <button
          type="button"
          className={`hamburger-btn${isOpen ? " is-open" : ""}`}
          onClick={onToggle}
          aria-label="Öppna meny"
          aria-expanded={isOpen}
        >
          <FiMenu size={24} />
        </button>

        <aside className={`dashboard-sidebar${isOpen ? " is-open" : ""}`}>

      {/* Logga*/}
      <div className="dashboard-sidebar-logo">
        <img
          className="dashboard-sidebar-logo-image"
          src={logo}
          alt="SEB"
        />
        <button
          type="button"
          className="dashboard-sidebar-close"
          onClick={onClose}
          aria-label="Stäng meny"
        >
          <FiX size={24} />
        </button>
      </div>


      {/* Navigation */}
      <nav className="dashboard-sidebar-nav">

        <NavLink to="/dashboard" className={overviewClassName}>
          <FiHome />
          <span>Översikt</span>
        </NavLink>

        <NavLink to="/payments" className={paymentsClassName}>
          <FiCreditCard />
          <span>Betalningar</span>
        </NavLink>

        <NavLink to="/approvals" onClick={onClose} className={({ isActive }) => `dashboard-sidebar-link${isActive ? " active" : ""}`}>
          <FiCheckSquare />
          <span>Godkännanden</span>

          <span className="dashboard-sidebar-badge">
            {pendingCount ?? "—"}
          </span>
        </NavLink>

        <NavLink to="/accounts" className={accountsClassName}>
          <FiBriefcase />
          <span>Konton</span>
        </NavLink>

        <NavLink to="/batch-files" onClick={onClose} className={({ isActive }) => `dashboard-sidebar-link${isActive ? " active" : ""}`}>
          <FiFileText />
          <span>Batchfiler</span>
        </NavLink>

        <NavLink to="/reports" onClick={onClose} className={({ isActive }) => `dashboard-sidebar-link${isActive ? " active" : ""}`}>
          <FiBarChart2 />
          <span>Rapporter</span>
        </NavLink>

        <NavLink to="/audit-log" onClick={onClose} className={({ isActive }) => `dashboard-sidebar-link${isActive ? " active" : ""}`}>
          <FiActivity />
          <span>Audit-logg</span>
        </NavLink>

        <NavLink to="/settings" onClick={onClose} className={({ isActive }) => `dashboard-sidebar-link${isActive ? " active" : ""}`}>
          <FiSettings />
          <span>Inställningar</span>
        </NavLink>

      </nav>


      {/* Användare, skriv rätt användare vid inloggning */}
      <div className="dashboard-sidebar-user">

        <div className="dashboard-sidebar-avatar">
          AA
        </div>

        <div className="dashboard-sidebar-user-info">
          <span className="dashboard-sidebar-user-name">
            Anna Andersson
          </span>

          <span className="dashboard-sidebar-user-company">
            Malmö Bygg AB
          </span>
        </div>

        <button
          type="button"
          className="dashboard-sidebar-logout"
          aria-label="Logga ut"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-busy={isLoggingOut}
        >
          <FiLogOut />
        </button>

      </div>

      {logoutError && <p role="alert">{logoutError}</p>}

        </aside>
      </>
  );
}
