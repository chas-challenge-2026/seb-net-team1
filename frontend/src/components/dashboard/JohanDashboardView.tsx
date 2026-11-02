import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  FiActivity,
  FiAlertTriangle,
  FiBriefcase,
  FiCheckCircle,
  FiCheckSquare,
  FiChevronLeft,
  FiChevronRight,
  FiCreditCard,
  FiHelpCircle,
  FiHome,
  FiLogOut,
  FiMenu,
  FiPlus,
  FiSettings,
  FiX,
} from "react-icons/fi";
import { logout } from "../../api/usersApi";
import { ApprovalApiError, getApprovalInbox } from "../../api/approvalsApi";
import { getRecipients, normalizeRecipientIban } from "../../api/recipientsApi";
import type { DashboardData } from "../../api/dashboardApi";
import type { PendingApproval } from "../../types/Approval";
import type { Recipient } from "../../types/Recipient";
import type { User } from "../../types/User";
import { canReadAuditLog } from "../../utils/auditAccess";
import ApprovalNotifications from "./ApprovalNotifications";
import logo from "../../assets/seb_logo_white.png";
import "../../styles/johanDashboard.css";

interface JohanDashboardViewProps {
  data: DashboardData | null;
  user: User;
  error: string | null;
}

const numberFormatter = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const timeFormatter = new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" });

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Johan";
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    initiator: "Initiator",
    attestant: "Attestant",
    admin: "Administratör",
  };
  return labels[role.toLocaleLowerCase("sv-SE")] ?? role;
}

function formatAmount(amount: number, currency: string) {
  return `${numberFormatter.format(amount)} ${currency === "SEK" ? "kr" : currency}`;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  const now = new Date();
  const isToday = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const isYesterday = date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate();
  const dayLabel = isToday
    ? "Idag"
    : isYesterday
      ? "Igår"
      : new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(date);
  return `${dayLabel}, ${timeFormatter.format(date)}`;
}

function formatPendingTotal(payments: PendingApproval[] | null) {
  if (payments === null) return "Hämtar väntande betalningar...";
  const totals = new Map<string, number>();
  payments.forEach((payment) => {
    totals.set(payment.currency, (totals.get(payment.currency) ?? 0) + Number(payment.amount));
  });
  if (totals.size === 0) return "0 kr";
  return Array.from(totals, ([currency, amount]) => formatAmount(amount, currency)).join(" · ");
}

function getLatestDate(payments: PendingApproval[] | null) {
  if (payments === null) return "";
  const latest = payments.reduce<PendingApproval | null>((current, payment) =>
    !current || new Date(payment.createdAt).valueOf() > new Date(current.createdAt).valueOf()
      ? payment
      : current,
  null);
  return latest ? `Senast ${formatCreatedAt(latest.createdAt).toLocaleLowerCase("sv-SE")}` : "Inga nya betalningar";
}

function JohanNavbar({ user, tenantName, pendingCount }: {
  user: User;
  tenantName: string | null;
  pendingCount: number;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const name = firstName(user.name);
  const canAudit = canReadAuditLog(user.role);
  const links: { label: string; to: string; icon: ReactNode; badge?: number }[] = [
    { label: "Översikt", to: "/dashboard", icon: <FiHome aria-hidden="true" /> },
    { label: "Godkännanden", to: "/approval-inbox", icon: <FiCheckSquare aria-hidden="true" />, badge: pendingCount },
    { label: "Betalningar", to: "/payments", icon: <FiCreditCard aria-hidden="true" /> },
    { label: "Konton", to: "/accounts", icon: <FiBriefcase aria-hidden="true" /> },
    ...(canAudit ? [{ label: "Audit-logg", to: "/audit-log", icon: <FiActivity aria-hidden="true" /> }] : []),
  ];

  function isCurrent(to: string) {
    if (to === "/dashboard") return location.pathname === to;
    if (to === "/approval-inbox") return location.pathname === to;
    if (to === "/payments") return location.pathname === to || location.pathname.startsWith("/payments/") || location.pathname === "/new-payment";
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
    <header className="johan-navbar">
      <Link className="johan-navbar__brand" to="/dashboard" aria-label="SEB – översikt">
        <img src={logo} alt="SEB" />
      </Link>
      <button
        className="johan-navbar__menu-toggle"
        type="button"
        aria-label={menuOpen ? "Stäng meny" : "Öppna meny"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
      </button>
      <nav className={`johan-navbar__links${menuOpen ? " is-open" : ""}`} aria-label="Huvudmeny">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`johan-navbar__link${isCurrent(link.to) ? " is-active" : ""}`}
            aria-current={isCurrent(link.to) ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {link.icon}
            <span>{link.label}</span>
            {link.badge !== undefined && link.badge > 0 && <span className="johan-navbar__badge">{link.badge}</span>}
          </Link>
        ))}
      </nav>
      <div className="johan-navbar__right">
        <ApprovalNotifications user={user} />
        <details className="johan-navbar__profile">
          <summary aria-label={`Användarmeny för ${name}`}>
            <span className="johan-navbar__avatar">{name.charAt(0).toLocaleUpperCase("sv-SE") || "J"}</span>
            <span className="johan-navbar__identity">
              <strong>{name}</strong>
              <span>{tenantName ?? "Företagskonto"}</span>
              <em>{roleLabel(user.role)}</em>
            </span>
          </summary>
          <div className="johan-navbar__profile-menu">
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

function ApprovalSummary({ approvals, error, onRetry }: {
  approvals: PendingApproval[] | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <section className="johan-approval-summary johan-approval-summary--error" aria-labelledby="johan-approval-summary-title" role="alert">
        <span className="johan-approval-summary__icon"><FiAlertTriangle aria-hidden="true" /></span>
        <div className="johan-approval-summary__copy">
          <h2 id="johan-approval-summary-title">Kunde inte hämta godkännanden</h2>
          <p>{error}</p>
        </div>
        <button className="johan-button johan-button--primary" type="button" onClick={onRetry}>Försök igen</button>
      </section>
    );
  }

  if (approvals === null) {
    return (
      <section className="johan-approval-summary johan-approval-summary--loading" aria-labelledby="johan-approval-summary-title" role="status">
        <span className="johan-approval-summary__icon"><FiActivity aria-hidden="true" /></span>
        <div className="johan-approval-summary__copy">
          <h2 id="johan-approval-summary-title">Hämtar väntande betalningar...</h2>
          <p>Vi hämtar din personliga attestlista.</p>
        </div>
      </section>
    );
  }

  if (approvals.length === 0) {
    return (
      <section className="johan-approval-summary johan-approval-summary--clear" aria-labelledby="johan-approval-summary-title" role="status">
        <span className="johan-approval-summary__icon"><FiCheckCircle aria-hidden="true" /></span>
        <div className="johan-approval-summary__copy">
          <h2 id="johan-approval-summary-title">Du är ikapp</h2>
          <p>Inga betalningar väntar på ditt godkännande just nu.</p>
        </div>
        <Link className="johan-button johan-button--primary" to="/approval-inbox">
          Visa attesthistorik <FiChevronRight aria-hidden="true" />
        </Link>
      </section>
    );
  }

  const count = approvals.length;
  return (
    <section className="johan-approval-summary" aria-labelledby="johan-approval-summary-title">
      <span className="johan-approval-summary__icon"><FiAlertTriangle aria-hidden="true" /></span>
      <div className="johan-approval-summary__copy">
        <h2 id="johan-approval-summary-title">
          {`${count} ${count === 1 ? "betalning att godkänna" : "betalningar att godkänna"}`}
        </h2>
        <p>{`Totalt ${formatPendingTotal(approvals)} – ${getLatestDate(approvals)}`}</p>
      </div>
      <Link className="johan-button johan-button--primary" to="/approval-inbox">
        Granska och godkänn <FiChevronRight aria-hidden="true" />
      </Link>
    </section>
  );
}

function ApprovalTable({ approvals, recipientNames }: {
  approvals: PendingApproval[];
  recipientNames: Map<string, string>;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(approvals.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const startIndex = (currentPage - 1) * pageSize;
  const visibleApprovals = approvals.slice(startIndex, startIndex + pageSize);
  const firstPageNumber = Math.max(1, Math.min(currentPage - 1, pageCount - 2));
  const pageNumbers = Array.from({ length: Math.min(pageCount, 3) }, (_, index) => firstPageNumber + index);

  return (
    <section className="johan-approval-table-card" aria-label="Betalningar att godkänna">
      <div className="johan-approval-table-scroll" role="region" aria-label="Väntande godkännanden" tabIndex={0}>
        <table className="johan-approval-table">
          <caption className="johan-sr-only">Betalningar som väntar på Johans godkännande</caption>
          <thead>
            <tr>
              <th scope="col">Referens-ID</th>
              <th scope="col">Mottagare</th>
              <th scope="col" className="johan-approval-table__amount">Belopp</th>
              <th scope="col">Skapad av</th>
              <th scope="col">Skapad datum</th>
              <th scope="col" className="johan-approval-table__action-heading">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {visibleApprovals.map((approval) => (
              <tr key={approval.approvalStepId}>
                <td className="johan-approval-table__reference">{approval.reference || `PAY-${approval.paymentId}`}</td>
                <td className="johan-approval-table__recipient" title={approval.toIban}>
                  {recipientNames.get(normalizeRecipientIban(approval.toIban)) || approval.toIban || "—"}
                </td>
                <td className="johan-approval-table__amount">{formatAmount(Number(approval.amount), approval.currency)}</td>
                <td>{approval.createdByName || "—"}</td>
                <td><time dateTime={approval.createdAt}>{formatCreatedAt(approval.createdAt)}</time></td>
                <td className="johan-approval-table__action">
                  <Link to={`/approval-inbox?paymentId=${approval.paymentId}`}>Granska</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="johan-approval-table__footer">
        <p>{`Visar ${startIndex + 1}–${Math.min(startIndex + pageSize, approvals.length)} av ${approvals.length} betalningar`}</p>
        <nav className="johan-pagination" aria-label="Sidor för väntande betalningar">
          <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Föregående sida">
            <FiChevronLeft aria-hidden="true" />
          </button>
          {pageNumbers.map((pageNumber) => (
            <button
              type="button"
              key={pageNumber}
              onClick={() => setPage(pageNumber)}
              className={pageNumber === currentPage ? "is-current" : ""}
              aria-current={pageNumber === currentPage ? "page" : undefined}
            >
              {pageNumber}
            </button>
          ))}
          <button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="Nästa sida">
            <FiChevronRight aria-hidden="true" />
          </button>
        </nav>
      </footer>
    </section>
  );
}

function BalanceCard({ data }: { data: DashboardData | null }) {
  return (
    <section className="johan-balance-card" aria-labelledby="johan-balance-title">
      <span className="johan-balance-card__icon"><FiBriefcase aria-hidden="true" /></span>
      <div className="johan-balance-card__copy">
        <h2 id="johan-balance-title">Tillgängligt saldo</h2>
        <strong>{data ? `${numberFormatter.format(data.summary.totalBalance)} kr` : "—"}</strong>
      </div>
      <Link className="johan-button johan-button--primary" to="/accounts">Visa alla konton</Link>
    </section>
  );
}

function QuickActions() {
  const actions = [
    { label: "Granska betalningar", to: "/approval-inbox", icon: <FiPlus aria-hidden="true" /> },
    { label: "Attesthistorik", to: "/audit-log", icon: <FiActivity aria-hidden="true" /> },
    { label: "Attestregler", to: "/settings", icon: <FiCheckSquare aria-hidden="true" /> },
    { label: "Kontoinformation", to: "/accounts", icon: <FiSettings aria-hidden="true" /> },
  ];
  return (
    <section className="johan-quick-card" aria-labelledby="johan-quick-title">
      <h2 id="johan-quick-title">Snabbåtgärder</h2>
      <div className="johan-quick-grid">
        {actions.map((action) => (
          <Link className="johan-quick-action" to={action.to} key={action.label}>
            <span className="johan-quick-action__icon">{action.icon}</span>
            <span>{action.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function HelpBanner() {
  return (
    <Link className="johan-help-banner" to="/settings" aria-label="Behöver du hjälp? Öppna inställningar">
      <FiHelpCircle className="johan-help-banner__icon" aria-hidden="true" />
      <span className="johan-help-banner__copy">
        <strong>Behöver du hjälp?</strong>
        <small>Här hittar du svar på vanliga frågor och mer information om<br className="johan-desktop-break" /> hur betalningar fungerar.</small>
      </span>
      <FiChevronRight className="johan-help-banner__arrow" aria-hidden="true" />
    </Link>
  );
}

export default function JohanDashboardView({ data, user, error }: JohanDashboardViewProps) {
  const name = firstName(data?.user.name ?? user.name);
  const displayedUser = data?.user ?? user;
  const [approvals, setApprovals] = useState<PendingApproval[] | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalRequest, setApprovalRequest] = useState(0);
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    getRecipients(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRecipients(result.recipients);
      })
      .catch(() => {
        // Recipient names are an enhancement; the IBAN remains a usable fallback.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    getApprovalInbox({ signal: controller.signal })
      .then((inbox) => {
        if (!controller.signal.aborted) setApprovals(inbox.pending);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setApprovalError(
          cause instanceof ApprovalApiError
            ? cause.message
            : cause instanceof TypeError
              ? "Kunde inte nå servern. Kontrollera anslutningen och försök igen."
              : "Kunde inte hämta väntande betalningar. Försök igen."
        );
      });

    return () => controller.abort();
  }, [approvalRequest]);

  function retryApprovals() {
    setApprovals(null);
    setApprovalError(null);
    setApprovalRequest((request) => request + 1);
  }

  const recipientNames = new Map(
    recipients.map((recipient) => [normalizeRecipientIban(recipient.iban), recipient.name]),
  );
  const pendingCount = approvals?.length ?? 0;
  return (
    <div className="johan-dashboard">
      <JohanNavbar user={displayedUser} tenantName={data?.tenantName ?? null} pendingCount={pendingCount} />
      <section className="johan-hero" aria-labelledby="johan-hero-title">
        <div className="johan-hero__content">
          <h1 id="johan-hero-title">Hej {name},</h1>
          <p>Här är de betalningar som väntar på din attest.</p>
        </div>
      </section>
      <main className="johan-dashboard__main">
        {error && <p className="johan-dashboard__error" role="alert">{error}</p>}
        <ApprovalSummary approvals={approvals} error={approvalError} onRetry={retryApprovals} />
        {approvals !== null && approvals.length > 0 && !approvalError && (
          <ApprovalTable
            approvals={approvals}
            recipientNames={recipientNames}
          />
        )}
        <BalanceCard data={data} />
        <QuickActions />
        <HelpBanner />
      </main>
    </div>
  );
}
