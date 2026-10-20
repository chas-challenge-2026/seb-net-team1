import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiBell, FiRefreshCw, FiX } from "react-icons/fi";
import { useApprovalNotifications } from "../../hooks/useApprovalNotifications";
import type { User } from "../../types/User";
import { formatPaymentAmount, formatPaymentDate, formatPaymentId } from "../../utils/paymentPresentation";
import "../../styles/approvalNotifications.css";

type ApprovalNotificationsProps = {
  user?: User | null;
};

function getStoredUser(): User | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("user") ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const stored = value as Partial<User>;
    if (!Number.isSafeInteger(stored.id) || (stored.id ?? 0) <= 0 ||
      !Number.isSafeInteger(stored.tenantId) || (stored.tenantId ?? 0) <= 0 ||
      typeof stored.name !== "string" || typeof stored.email !== "string" ||
      typeof stored.role !== "string") return null;
    return stored as User;
  } catch {
    return null;
  }
}

export default function ApprovalNotifications({ user }: ApprovalNotificationsProps) {
  const [storedOverride, setStoredOverride] = useState<{ user: User | null } | null>(null);
  const displayedUser = storedOverride ? storedOverride.user : user === undefined ? getStoredUser() : user;
  const { pending, isLoading, error, canApprove, refresh } = useApprovalNotifications(displayedUser);
  const location = useLocation();
  const [openedLocation, setOpenedLocation] = useState<string | null>(null);
  const [seenLocation, setSeenLocation] = useState(location.key);
  if (seenLocation !== location.key) {
    setSeenLocation(location.key);
    setOpenedLocation(null);
  }
  const isOpen = openedLocation === location.key;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const count = canApprove && !error ? pending.length : 0;
  const requiresLogin = !displayedUser || error?.status === 401;
  const accessDenied = error?.status === 403;

  useEffect(() => {
    function handleStoredUser(event: StorageEvent) {
      if (event.key === "user" || event.key === null) {
        setStoredOverride({ user: getStoredUser() });
      }
    }
    window.addEventListener("storage", handleStoredUser);
    return () => window.removeEventListener("storage", handleStoredUser);
  }, []);

  function closeAndRestoreFocus() {
    setOpenedLocation(null);
    bellRef.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) return;

    function updatePosition() {
      const bell = bellRef.current;
      const panel = panelRef.current;
      if (!bell || !panel) return;
      const bounds = bell.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelWidth = Math.min(380, viewportWidth - 24);
      const right = Math.max(12, Math.min(viewportWidth - bounds.right, viewportWidth - panelWidth - 12));
      const top = Math.max(12, Math.min(bounds.bottom + 8, viewportHeight - 180));
      panel.style.right = `${right}px`;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${Math.max(0, Math.min(480, viewportHeight - top - 12))}px`;
    }

    function handleOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) {
        setOpenedLocation(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenedLocation(null);
        bellRef.current?.focus();
      }
    }

    updatePosition();
    panelRef.current?.focus();
    document.addEventListener("pointerdown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  return (
    <div className="approval-notifications" ref={wrapperRef}>
      <button
        ref={bellRef}
        type="button"
        className="dashboard-notification-button approval-notifications-bell"
        aria-label={count > 0
          ? `Notiser, ${count} ${count === 1 ? "betalning väntar" : "betalningar väntar"} på godkännande`
          : "Notiser"}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={panelId}
        title="Notiser"
        onClick={() => {
          if (isOpen) {
            setOpenedLocation(null);
          } else {
            setOpenedLocation(location.key);
            refresh();
          }
        }}
      >
        <FiBell className="dashboard-notification-icon" aria-hidden="true" />
        {count > 0 && <span className="approval-notifications-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </button>

      {isOpen && (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-label="Notiser"
          aria-modal="false"
          tabIndex={-1}
          className="approval-notifications-panel"
        >
          <div className="approval-notifications-header">
            <div>
              <h2>Notiser</h2>
              <p>Betalningar som väntar på godkännande</p>
            </div>
            <div className="approval-notifications-actions">
              {canApprove && !requiresLogin && !accessDenied && (
                <button
                  type="button"
                  className="approval-notifications-icon-button"
                  aria-label="Uppdatera notiser"
                  title="Uppdatera notiser"
                  disabled={isLoading}
                  onClick={refresh}
                ><FiRefreshCw aria-hidden="true" /></button>
              )}
              <button
                type="button"
                className="approval-notifications-icon-button"
                aria-label="Stäng notiser"
                title="Stäng notiser"
                onClick={closeAndRestoreFocus}
              ><FiX aria-hidden="true" /></button>
            </div>
          </div>

          {requiresLogin ? (
            <div className="approval-notifications-state">
              <p>Logga in för att se dina notiser.</p>
              <Link to="/" onClick={() => setOpenedLocation(null)}>Till inloggning</Link>
            </div>
          ) : accessDenied ? (
            <div className="approval-notifications-state">
              <p role="alert">Du saknar behörighet att se godkännanden.</p>
            </div>
          ) : !canApprove ? (
            <div className="approval-notifications-state">
              <p>Din roll har inga betalningar att godkänna. Godkännanden hanteras av attestanter och administratörer.</p>
            </div>
          ) : isLoading ? (
            <div className="approval-notifications-state">
              <p role="status">Hämtar notiser...</p>
            </div>
          ) : error ? (
            <div className="approval-notifications-state">
              <p role="alert">{error.message}</p>
              <button type="button" className="approval-notifications-retry" onClick={refresh}>Försök igen</button>
            </div>
          ) : pending.length === 0 ? (
            <div className="approval-notifications-state">
              <p role="status">Inga betalningar väntar på ditt godkännande.</p>
            </div>
          ) : (
            <ul className="approval-notifications-list" aria-label="Betalningar att godkänna">
              {pending.map((approval) => {
                const reference = approval.reference.trim();
                const paymentId = formatPaymentId(approval.paymentId);
                return (
                  <li key={approval.paymentId}>
                    <Link
                      className="approval-notifications-payment"
                      to={`/approval-inbox?paymentId=${approval.paymentId}`}
                      onClick={() => setOpenedLocation(null)}
                    >
                      <span className="approval-notifications-payment-heading">
                        <strong>{reference || paymentId}</strong>
                        <span className="approval-notifications-amount">{formatPaymentAmount(approval.amount, approval.currency)}</span>
                      </span>
                      <span>Skapad av {approval.createdByName.trim() || "Okänd användare"}</span>
                      <span className="approval-notifications-date">
                        {reference && <span>{paymentId} · </span>}
                        <time dateTime={approval.createdAt}>{formatPaymentDate(approval.createdAt)}</time>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {canApprove && !requiresLogin && !accessDenied && (
            <Link className="approval-notifications-footer" to="/approval-inbox" onClick={() => setOpenedLocation(null)}>
              Visa alla godkännanden
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
