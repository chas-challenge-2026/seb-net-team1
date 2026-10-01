import "../../styles/dashboard.css";
import logo from "../../assets/seb_logo_white.png";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
    const paymentsClassName = `dashboard-sidebar-link${pathname === "/new-payment" ? " active" : ""}`;
    const accountsClassName = `dashboard-sidebar-link${pathname === "/accounts" ? " active" : ""}`;
    const approvalsClassName = `dashboard-sidebar-link${pathname === "/approval-inbox" ? " active" : ""}`;
    const batchFilesClassName = `dashboard-sidebar-link${pathname === "/batch-upload" ? " active" : ""}`;
    const reportsClassName = `dashboard-sidebar-link${pathname === "/reports" ? " active" : ""}`;
    const auditLogClassName = `dashboard-sidebar-link${pathname === "/audit-log" ? " active" : ""}`;

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

        <Link to="/dashboard" className={overviewClassName}>
          <FiHome />
          <span>Översikt</span>
        </Link>

        <Link to="/new-payment" className={paymentsClassName}>
          <FiCreditCard />
          <span>Betalningar</span>
        </Link>

        <Link to="/approval-inbox" className={approvalsClassName}>
          <FiCheckSquare />
          <span>Godkännanden</span>

          <span className="dashboard-sidebar-badge">
            12 {/* Exempel siffra, implementera riktig data senare*/}
          </span>
        </Link>

        <Link to="/accounts" className={accountsClassName}>
          <FiBriefcase />
          <span>Konton</span>
        </Link>

        <Link to="/batch-upload" className={batchFilesClassName}>
          <FiFileText />
          <span>Batchfiler</span>
        </Link>

        <Link to="/reports" className={reportsClassName}>
          <FiBarChart2 />
          <span>Rapporter</span>
        </Link>

        <Link to="/audit-log" className={auditLogClassName}>
          <FiActivity />
          <span>Audit-logg</span>
        </Link>

        <a href="#" className="dashboard-sidebar-link">
          <FiSettings />
          <span>Inställningar</span>
        </a>

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
