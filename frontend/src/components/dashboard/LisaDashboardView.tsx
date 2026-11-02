import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FiAlertCircle,
  FiBarChart2,
  FiBriefcase,
  FiCheckCircle,
  FiCheckSquare,
  FiChevronRight,
  FiCreditCard,
  FiFileText,
  FiHelpCircle,
  FiHome,
  FiList,
  FiLogOut,
  FiMenu,
  FiPlus,
  FiUpload,
  FiX,
  FiXCircle,
  FiClock,
} from "react-icons/fi";
import logo from "../../assets/seb_logo_white.png";
import { logout } from "../../api/usersApi";
import type { DashboardData, DashboardPayment } from "../../api/dashboardApi";
import type { User } from "../../types/User";
import ApprovalNotifications from "./ApprovalNotifications";
import { canReadAuditLog } from "../../utils/auditAccess";
import "../../styles/lisaDashboard.css";

interface LisaDashboardViewProps {
  data: DashboardData | null;
  user: User;
  error: string | null;
}

const numberFormatter = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });
const timeFormatter = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });

function formatAmount(amount: number, currency: string) {
  const unit = currency === "SEK" ? "SEK" : currency;
  return `${numberFormatter.format(amount)} ${unit}`;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : dateFormatter.format(date);
}

function formatPendingTotal(payments: DashboardPayment[]) {
  const totals = new Map<string, number>();
  payments.forEach((payment) => {
    totals.set(payment.currency, (totals.get(payment.currency) ?? 0) + payment.amount);
  });
  if (totals.size === 0) return "0 kr";
  return Array.from(totals, ([currency, amount]) =>
    `${numberFormatter.format(amount)} ${currency === "SEK" ? "kr" : currency}`
  ).join(" · ");
}

function formatLatestPaymentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const today = new Date();
  const isToday = date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  const label = isToday
    ? `idag ${timeFormatter.format(date)}`
    : new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  return `Senast ${label}`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Lisa";
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    initiator: "Initiator",
    attestant: "Attestant",
    admin: "Administratör",
  };
  return labels[role.toLocaleLowerCase("sv-SE")] ?? role;
}

function LisaNavbar({ user, tenantName }: { user: User; tenantName: string | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const name = firstName(user.name);
  const initial = name.charAt(0).toLocaleUpperCase("sv-SE") || "L";
  const links = [
    { label: "Översikt", to: "/dashboard", icon: <FiHome aria-hidden="true" /> },
    { label: "Betalningar", to: "/payments", icon: <FiCreditCard aria-hidden="true" /> },
    { label: "Konton", to: "/accounts", icon: <FiBriefcase aria-hidden="true" /> },
    { label: "Batchfiler", to: "/batch-files", icon: <FiFileText aria-hidden="true" /> },
    { label: "Rapporter", to: "/reports", icon: <FiBarChart2 aria-hidden="true" /> },
  ];

  function isCurrent(to: string) {
    if (to === "/dashboard") return location.pathname === to;
    if (to === "/payments") return location.pathname === to || location.pathname.startsWith("/payments/") || location.pathname === "/new-payment";
    if (to === "/batch-files") return location.pathname === to || location.pathname.startsWith("/batch-files/") || location.pathname === "/batch-upload";
    return location.pathname === to;
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      localStorage.removeItem("user");
      navigate("/logout", { replace: true });
    } catch {
      setLogoutError("Kunde inte logga ut. Försök igen.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <header className="lisa-navbar">
      <Link className="lisa-navbar__brand" to="/dashboard" aria-label="SEB – översikt">
        <img src={logo} alt="SEB" />
      </Link>

      <button
        className="lisa-navbar__menu-toggle"
        type="button"
        aria-label={menuOpen ? "Stäng meny" : "Öppna meny"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
      </button>

      <nav className={`lisa-navbar__links${menuOpen ? " is-open" : ""}`} aria-label="Huvudmeny">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`lisa-navbar__link${isCurrent(link.to) ? " is-active" : ""}`}
            aria-current={isCurrent(link.to) ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {link.icon}
            <span>{link.label}</span>
          </Link>
        ))}
      </nav>

      <div className="lisa-navbar__right">
        <ApprovalNotifications user={user} />
        <details className="lisa-navbar__profile">
          <summary aria-label={`Användarmeny för ${name}`}>
            <span className="lisa-navbar__avatar">{initial}</span>
            <span className="lisa-navbar__identity">
              <strong>{name}</strong>
              <span>{tenantName ?? "Företagskonto"}</span>
              <em>{roleLabel(user.role)}</em>
            </span>
          </summary>
          <div className="lisa-navbar__profile-menu">
            <p>{user.name}</p>
            <Link to="/settings">Inställningar</Link>
            <button type="button" onClick={() => void handleLogout()} disabled={loggingOut}>
              <FiLogOut aria-hidden="true" />
              {loggingOut ? "Loggar ut..." : "Logga ut"}
            </button>
            {logoutError && <span role="alert">{logoutError}</span>}
          </div>
        </details>
      </div>
    </header>
  );
}

function BalanceCard({ data }: { data: DashboardData | null }) {
  return (
    <section className="lisa-card lisa-balance-card" aria-labelledby="lisa-balance-title">
      <span className="lisa-card__icon lisa-card__icon--green"><FiCreditCard aria-hidden="true" /></span>
      <div className="lisa-balance-card__copy">
        <h2 id="lisa-balance-title">Tillgängligt saldo</h2>
        <strong>{data ? `${numberFormatter.format(data.summary.totalBalance)} kr` : "—"}</strong>
      </div>
      <Link className="lisa-button lisa-button--primary" to="/accounts">Visa alla konton</Link>
    </section>
  );
}

function PendingPaymentsCard({ data, user }: { data: DashboardData | null; user: User }) {
  const approvals = data?.pendingApprovals ?? [];
  const count = data?.paymentStatusCounts.pendingApproval;
  const latest = approvals.reduce<DashboardPayment | null>((current, payment) =>
    !current || new Date(payment.createdAt).valueOf() > new Date(current.createdAt).valueOf() ? payment : current,
  null);
  const lastUpdated = latest ? formatLatestPaymentDate(latest.createdAt) : "Inga nya betalningar";
  const destination = canReadAuditLog(user.role) ? "/approval-inbox" : "/payments";

  return (
    <Link className="lisa-pending-card" to={destination}>
      <span className="lisa-card__icon lisa-card__icon--green"><FiBriefcase aria-hidden="true" /></span>
      <span className="lisa-pending-card__copy">
        <strong>{count === undefined ? "Betalningar väntar på godkännande" : `${count} ${count === 1 ? "betalning väntar" : "betalningar väntar"} på godkännande`}</strong>
        <span>{data ? `Totalt ${formatPendingTotal(approvals)} · ${lastUpdated}` : "Hämtar betalningar..."}</span>
      </span>
      <FiChevronRight className="lisa-pending-card__arrow" aria-hidden="true" />
    </Link>
  );
}

interface Action {
  label: string;
  to: string;
  icon: ReactNode;
}

function QuickActionsCard() {
  const actions: Action[] = [
    { label: "Ny betalning", to: "/new-payment", icon: <FiPlus aria-hidden="true" /> },
    { label: "Ladda upp fil", to: "/batch-upload", icon: <FiUpload aria-hidden="true" /> },
    { label: "Rapport", to: "/reports", icon: <FiCheckSquare aria-hidden="true" /> },
    { label: "Visa alla betalningar", to: "/payments", icon: <FiList aria-hidden="true" /> },
  ];
  return (
    <section className="lisa-card lisa-quick-card" aria-labelledby="lisa-quick-title">
      <h2 id="lisa-quick-title">Snabbåtgärder</h2>
      <div className="lisa-quick-grid">
        {actions.map((action) => (
          <Link className="lisa-quick-action" key={action.to} to={action.to}>
            <span className="lisa-quick-action__icon">{action.icon}</span>
            <span>{action.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function PanelHeading({ title, to, linkLabel = "Visa alla" }: { title: string; to: string; linkLabel?: string }) {
  return (
    <div className="lisa-panel-heading">
      <h2>{title}</h2>
      <Link to={to}>{linkLabel}<FiChevronRight aria-hidden="true" /></Link>
    </div>
  );
}

function UpcomingPaymentsCard({ data }: { data: DashboardData | null }) {
  const payments = data?.upcomingPayments.slice(0, 3) ?? [];
  return (
    <section className="lisa-card lisa-list-card" aria-label="Kommande betalningar">
      <PanelHeading title="Kommande betalningar" to="/payments" />
      {!data ? <p className="lisa-empty">Hämtar betalningar...</p> : payments.length === 0 ? (
        <p className="lisa-empty">Inga kommande betalningar</p>
      ) : (
        <div className="lisa-payment-list">
          {payments.map((payment) => (
            <Link className="lisa-payment-row lisa-payment-row--upcoming" to={`/payments/${payment.id}`} key={payment.id}>
              <span className="lisa-row-icon lisa-row-icon--pending"><FiFileText aria-hidden="true" /></span>
              <span className="lisa-payment-row__main">
                <strong>{payment.reference || `Betalning #${payment.id}`}</strong>
                <small>{formatShortDate(payment.createdAt)}</small>
              </span>
              <span className="lisa-payment-row__amount">
                <strong>{formatAmount(payment.amount, payment.currency)}</strong>
                <small>{payment.status === "pending_approval" ? "Väntar på godkännande" : "Pågående"}</small>
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function PaymentHistoryCard({ data, user }: { data: DashboardData | null; user: User }) {
  const payments = data?.payments.slice(0, 3) ?? [];
  return (
    <section className="lisa-card lisa-list-card lisa-history-card" aria-label="Betalningshistorik">
      <PanelHeading title="Betalningshistorik" to="/payments" />
      {!data ? <p className="lisa-empty">Hämtar historik...</p> : payments.length === 0 ? (
        <p className="lisa-empty">Ingen betalningshistorik ännu</p>
      ) : (
        <div className="lisa-payment-list lisa-payment-list--history">
          {payments.map((payment) => {
            const ownPayment = payment.createdByName?.toLocaleLowerCase("sv-SE") === user.name.toLocaleLowerCase("sv-SE");
            return (
              <Link className="lisa-history-row" to={`/payments/${payment.id}`} key={payment.id}>
                <span className="lisa-row-icon lisa-row-icon--success"><FiPlus aria-hidden="true" /></span>
                <span className="lisa-history-row__main">
                  <strong>{ownPayment || !payment.createdByName ? "Skapade betalning" : payment.createdByName}</strong>
                  <small>{formatAmount(payment.amount, payment.currency)}</small>
                </span>
                <time dateTime={payment.createdAt}>{timeFormatter.format(new Date(payment.createdAt))}</time>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PaymentStatusCard({ data }: { data: DashboardData | null }) {
  const rows = [
    { label: "Genomförda", value: data?.paymentStatusCounts.completed, icon: <FiCheckCircle aria-hidden="true" />, kind: "success" },
    { label: "Pågående", value: data?.paymentStatusCounts.processing, icon: <FiClock aria-hidden="true" />, kind: "progress" },
    { label: "Väntar på godkännande", value: data?.paymentStatusCounts.pendingApproval, icon: <FiClock aria-hidden="true" />, kind: "pending" },
    { label: "Avvisade", value: data?.paymentStatusCounts.rejected, icon: <FiXCircle aria-hidden="true" />, kind: "rejected" },
    { label: "Misslyckade", value: data?.paymentStatusCounts.failed, icon: <FiAlertCircle aria-hidden="true" />, kind: "failed" },
  ];
  return (
    <section className="lisa-card lisa-status-card" aria-label="Betalningsstatus">
      <PanelHeading title="Betalningsstatus" to="/reports" linkLabel="Visa rapport" />
      <ul>
        {rows.map((row) => (
          <li key={row.label}>
            <span className={`lisa-status-icon lisa-status-icon--${row.kind}`}>{row.icon}</span>
            <span>{row.label}</span>
            <strong>{row.value ?? "—"}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function LisaDashboardView({ data, user, error }: LisaDashboardViewProps) {
  const name = firstName(data?.user.name ?? user.name);
  return (
    <div className="lisa-dashboard">
      <LisaNavbar user={data?.user ?? user} tenantName={data?.tenantName ?? null} />
      <section className="lisa-hero" aria-labelledby="lisa-hero-title">
        <div className="lisa-hero__content">
          <h1 id="lisa-hero-title">Hej {name},</h1>
          <p>Här är en översikt över ditt företags ekonomi och vad som<br className="lisa-hero__desktop-break" /> kräver din uppmärksamhet.</p>
        </div>
      </section>

      <main className="lisa-dashboard__main">
        {error && <p className="lisa-dashboard__error" role="alert">{error}</p>}
        <div className="lisa-dashboard__grid">
          <BalanceCard data={data} />
          <QuickActionsCard />
          <PendingPaymentsCard data={data} user={data?.user ?? user} />
          <UpcomingPaymentsCard data={data} />
          <PaymentHistoryCard data={data} user={data?.user ?? user} />
          <PaymentStatusCard data={data} />
        </div>

        <aside className="lisa-help-banner" aria-label="Hjälp">
          <span className="lisa-help-banner__icon"><FiHelpCircle aria-hidden="true" /></span>
          <span>
            <strong>Behöver du hjälp?</strong>
            <small>Här hittar du svar på vanliga frågor och mer information om<br className="lisa-hero__desktop-break" /> hur betalningar fungerar.</small>
          </span>
          <FiChevronRight className="lisa-help-banner__arrow" aria-hidden="true" />
        </aside>
      </main>
    </div>
  );
}
