import "../../styles/dashboard.css";
import logo from "../../assets/seb_logo_white.png";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { logout } from "../../api/usersApi";
import type { User } from "../../types/User";
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
  user?: User | null;
  tenantName?: string | null;
  pendingApprovalCount?: number;
}

function getStoredUser(): User | null {
  try {
    const storedUser = localStorage.getItem("user");
    return storedUser ? (JSON.parse(storedUser) as User) : null;
  } catch {
    return null;
  }
}

export default function DashboardSidebar({
  isOpen = false,
  onToggle,
  onClose,
  user,
  tenantName,
  pendingApprovalCount,
}: SidebarProps){
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [logoutError, setLogoutError] = useState("");
    const displayedUser = user ?? getStoredUser();
    const userInitials = displayedUser?.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") ?? "?";
    const overviewClassName = `dashboard-sidebar-link${pathname === "/dashboard" ? " active" : ""}`;
    const paymentsClassName = `dashboard-sidebar-link${pathname === "/new-payment" || pathname === "/payments" || pathname.startsWith("/payments/") ? " active" : ""}`;
    const accountsClassName = `dashboard-sidebar-link${pathname === "/accounts" ? " active" : ""}`;
    const approvalsClassName = `dashboard-sidebar-link${pathname === "/approval-inbox" ? " active" : ""}`;
    const batchFilesClassName = `dashboard-sidebar-link${pathname === "/batch-upload" || pathname === "/batch-files" || pathname.startsWith("/batch-files/") ? " active" : ""}`;
    const reportsClassName = `dashboard-sidebar-link${pathname === "/reports" ? " active" : ""}`;
    const auditLogClassName = `dashboard-sidebar-link${pathname === "/audit-log" ? " active" : ""}`;
    const settingsClassName = `dashboard-sidebar-link${pathname === "/settings" ? " active" : ""}`;

    async function handleLogout() {
      setIsLoggingOut(true);
      setLogoutError("");

      try {
        await logout();
        localStorage.removeItem("user");
        navigate("/logout", { replace: true });
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

        <Link to="/payments" className={paymentsClassName}>
          <FiCreditCard />
          <span>Betalningar</span>
        </Link>

        <Link to="/approval-inbox" className={approvalsClassName}>
          <FiCheckSquare />
          <span>Godkännanden</span>

          {pendingApprovalCount !== undefined && pendingApprovalCount > 0 && (
            <span className="dashboard-sidebar-badge">{pendingApprovalCount}</span>
          )}
        </Link>

        <Link to="/accounts" className={accountsClassName}>
          <FiBriefcase />
          <span>Konton</span>
        </Link>

        <Link to="/batch-files" className={batchFilesClassName}>
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

        <Link to="/settings" className={settingsClassName}>
          <FiSettings />
          <span>Inställningar</span>
        </Link>

      </nav>


      {/* Användare, skriv rätt användare vid inloggning */}
      <div className="dashboard-sidebar-user">

        <div className="dashboard-sidebar-avatar">
          {userInitials}
        </div>

        <div className="dashboard-sidebar-user-info">
          <span className="dashboard-sidebar-user-name">
            {displayedUser?.name ?? "Inloggad användare"}
          </span>

          {tenantName && (
            <span className="dashboard-sidebar-user-company">{tenantName}</span>
          )}
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
