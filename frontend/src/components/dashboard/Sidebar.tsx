import "../../styles/dashboard.css";
import logo from "../../assets/seb_logo_white.png";
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

        <a href="#" className="dashboard-sidebar-link active">
          <FiHome />
          <span>Översikt</span>
        </a>

        <a href="#" className="dashboard-sidebar-link">
          <FiCreditCard />
          <span>Betalningar</span>
        </a>

        <a href="#" className="dashboard-sidebar-link">
          <FiCheckSquare />
          <span>Godkännanden</span>

          <span className="dashboard-sidebar-badge">
            12 {/* Exempel siffra, implementera riktig data senare*/}
          </span>
        </a>

        <a href="#" className="dashboard-sidebar-link">
          <FiBriefcase />
          <span>Konton</span>
        </a>

        <a href="#" className="dashboard-sidebar-link">
          <FiFileText />
          <span>Batchfiler</span>
        </a>

        <a href="#" className="dashboard-sidebar-link">
          <FiBarChart2 />
          <span>Rapporter</span>
        </a>

        <a href="#" className="dashboard-sidebar-link">
          <FiActivity />
          <span>Audit-logg</span>
        </a>

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
            Acme Corporation
          </span>
        </div>

        <button
          type="button"
          className="dashboard-sidebar-logout"
          aria-label="Logga ut"
        >
          <FiLogOut />
        </button>

      </div>

        </aside>
      </>
  );
}