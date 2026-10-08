import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiSearch, FiSliders } from "react-icons/fi";
import { AuditLogApiError, getAuditLog } from "../api/auditLogApi";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import type { AuditEntry, AuditLogResponse } from "../types/AuditLog";
import "../styles/dashboard.css";
import "../styles/auditLog.css";

type AuditLogError = {
  message: string;
  requiresLogin: boolean;
};

type PageRequest = {
  cursor?: string;
  index: number;
};

type CursorNavigation = {
  cursors: (string | undefined)[];
  index: number;
};

type PageSlot = number | "leading-ellipsis" | "trailing-ellipsis";

function getReachedPageSlots(knownPages: number, currentPage: number): PageSlot[] {
  if (knownPages <= 7) {
    return Array.from({ length: knownPages }, (_, index) => index + 1);
  }

  const first = Math.max(2, Math.min(currentPage - 1, knownPages - 3));
  const last = Math.min(knownPages - 1, Math.max(currentPage + 1, 4));
  const pages: PageSlot[] = [1];
  if (first > 2) pages.push("leading-ellipsis");
  for (let page = first; page <= last; page++) pages.push(page);
  if (last < knownPages - 1) pages.push("trailing-ellipsis");
  pages.push(knownPages);
  return pages;
}

type ActionPresentation = {
  label: string;
  tone: "created" | "approved" | "step" | "rejected" | "neutral";
};

function getActionPresentation(action: string): ActionPresentation {
  switch (action) {
    case "CREATE_PAYMENT":
      return { label: "Skapade en betalning", tone: "created" };
    case "APPROVE_PAYMENT":
      return { label: "Godkände en betalning", tone: "approved" };
    case "APPROVE_PAYMENT_STEP":
      return { label: "Godkände ett atteststeg", tone: "step" };
    case "REJECT_PAYMENT":
      return { label: "Avvisade en betalning", tone: "rejected" };
    default:
      return { label: "Annan händelse", tone: "neutral" };
  }
}

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

function formatEntity(entry: AuditEntry): string {
  return [
    entry.entityType?.trim(),
    entry.entityId != null ? `#${entry.entityId}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function getAuditLogError(error: unknown): AuditLogError {
  return {
    message:
      error instanceof AuditLogApiError
        ? error.message
        : error instanceof TypeError
        ? "Kunde inte nå backend-API:t. Kontrollera anslutningen och försök igen."
        : "Kunde inte hämta granskningsloggen. Försök igen.",
    requiresLogin: error instanceof AuditLogApiError && error.status === 401,
  };
}

export default function AuditLog() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditLogResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [initialError, setInitialError] = useState<AuditLogError | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [pageError, setPageError] = useState<AuditLogError | null>(null);
  const [navigation, setNavigation] = useState<CursorNavigation>({ cursors: [undefined], index: 0 });
  const [showFilterNotice, setShowFilterNotice] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const currentPage = navigation.index + 1;
  const pageSlots = getReachedPageSlots(navigation.cursors.length, currentPage);

  const loadPage = useCallback((request?: PageRequest) => {
    if (activeRequest.current) {
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    const isNavigation = request !== undefined;

    getAuditLog({ cursor: request?.cursor, signal: controller.signal })
      .then((page) => {
        if (!controller.signal.aborted) {
          setAuditLog(page);
          setNavigation((current) => {
            if (!request) return { cursors: [undefined], index: 0 };

            // Retain reached pages on return; replace a forward path only if its cursor changed.
            const isKnownCursor = request.index < current.cursors.length &&
              current.cursors[request.index] === request.cursor;
            return {
              cursors: isKnownCursor
                ? current.cursors
                : [...current.cursors.slice(0, request.index), request.cursor],
              index: request.index,
            };
          });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          if (isNavigation) {
            setPageError(getAuditLogError(error));
          } else {
            setInitialError(getAuditLogError(error));
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          if (isNavigation) {
            setIsLoadingPage(false);
          } else {
            setIsLoading(false);
          }
        }

        if (activeRequest.current === controller) {
          activeRequest.current = null;
        }
      });
  }, []);

  useEffect(() => {
    loadPage();

    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [loadPage]);

  function retryInitialLoad() {
    if (activeRequest.current) {
      return;
    }

    setInitialError(null);
    setIsLoading(true);
    loadPage();
  }

  function loadNextPage() {
    if (activeRequest.current || auditLog?.nextCursor == null) {
      return;
    }

    setPageError(null);
    setIsLoadingPage(true);
    loadPage({ cursor: auditLog.nextCursor, index: navigation.index + 1 });
  }

  function loadKnownPage(index: number) {
    if (activeRequest.current || index < 0 || index >= navigation.cursors.length || index === navigation.index) {
      return;
    }

    setPageError(null);
    setIsLoadingPage(true);
    loadPage({ cursor: navigation.cursors[index], index });
  }

  return (
    <div className="dashboard-layout audit-log-layout">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((isOpen) => !isOpen)}
        onClose={() => setIsSidebarOpen(false)}
      />

      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? " is-open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Stäng meny"
      />

      <main className="dashboard-main audit-log-main">
        <div className="audit-log-header">
          <DashboardHeader
            title="Audit-logg"
            subtitle="Registrerade händelser för ditt företag."
            showSearch={false}
          />
          <label
            className="audit-log-header-search"
            title="Sökning är inte tillgänglig ännu."
          >
            <FiSearch aria-hidden="true" />
            <span className="audit-log-sr-only">Sök betalningar och konton</span>
            <input type="search" placeholder="Sök betalningar, konton..." />
          </label>
        </div>

        <div className="dashboard-content audit-log-content">
          <fieldset
            className="audit-log-toolbar"
            aria-describedby="audit-log-filter-availability"
            title="Sökning och filtrering är inte tillgängliga ännu."
            onFocus={() => setShowFilterNotice(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setShowFilterNotice(false);
            }}
          >
            <legend className="audit-log-sr-only">Sök och filtrera audit-loggen</legend>
            <p
              id="audit-log-filter-availability"
              className={showFilterNotice ? "audit-log-filter-notice" : "audit-log-sr-only"}
              role="status"
            >
              Sökning och filtrering är inte tillgängliga ännu. Inga filter har tillämpats.
            </p>
            <label className="audit-log-search">
              <FiSearch aria-hidden="true" />
              <span className="audit-log-sr-only">Sök loggar</span>
              <input type="search" name="search" placeholder="Sök loggar..." />
            </label>
            <label className="audit-log-filter">
              <select name="dateRange" aria-label="Period, endast All är tillgängligt" defaultValue="all">
                <option value="all">Date range: All</option>
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
            <label className="audit-log-filter">
              <select name="action" aria-label="Händelse, endast All är tillgängligt" defaultValue="all">
                <option value="all">Action: All</option>
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
            <label className="audit-log-filter">
              <select name="user" aria-label="Användare, endast All är tillgängligt" defaultValue="all">
                <option value="all">User: All</option>
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
            <Button
              type="button"
              className="audit-log-filter-button"
              onClick={() => setShowFilterNotice(true)}
              aria-describedby="audit-log-filter-availability"
            >
              <FiSliders aria-hidden="true" />
              Filters
            </Button>
          </fieldset>

          <section className="audit-log-results" aria-label="Registrerade audithändelser">
            <Card className="audit-log-card">
              {isLoading ? (
                <p className="audit-log-state" role="status">
                  Hämtar granskningslogg...
                </p>
              ) : initialError ? (
                <div className="audit-log-state">
                  <p className="audit-log-error" role="alert">
                    {initialError.message}
                  </p>
                  {initialError.requiresLogin ? (
                    <Link to="/" className="audit-log-login-link">
                      Till inloggning
                    </Link>
                  ) : (
                    <Button
                      type="button"
                      className="audit-log-button"
                      onClick={retryInitialLoad}
                    >
                      Försök igen
                    </Button>
                  )}
                </div>
              ) : auditLog ? (
                <>
                  {auditLog.entries.length === 0 ? (
                    <p className="audit-log-state" role="status">
                      Det finns inga audithändelser att visa.
                    </p>
                  ) : (
                    <div
                      className="audit-log-table-scroll"
                      role="region"
                      aria-label="Granskningslogg"
                      tabIndex={0}
                      aria-busy={isLoadingPage}
                    >
                      <table className="audit-log-table">
                        <caption className="audit-log-sr-only">
                          Registrerade audithändelser
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Datum/tid</th>
                            <th scope="col">Användare</th>
                            <th scope="col">Händelse</th>
                            <th scope="col">Detaljer</th>
                            <th scope="col">IP-adress</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLog.entries.map((entry) => {
                            const action = getActionPresentation(entry.action);
                            const entity = formatEntity(entry);

                            return (
                              <tr key={entry.id}>
                                <td className="audit-log-date">
                                  <time dateTime={entry.createdAt}>
                                    {formatDateTime(entry.createdAt)}
                                  </time>
                                </td>
                                <td className="audit-log-user">{entry.userName || "—"}</td>
                                <td>
                                  <span className={`audit-log-action audit-log-action--${action.tone}`}>
                                    {action.label}
                                  </span>
                                </td>
                                <td className="audit-log-details">
                                  <p
                                    className="audit-log-description"
                                    title={entry.description || "—"}
                                    tabIndex={0}
                                  >
                                    {entry.description || "—"}
                                  </p>
                                  <p className="audit-log-metadata">
                                    {entity && <span>{entity}</span>}
                                    <span>Audit #{entry.id}</span>
                                  </p>
                                </td>
                                <td className="audit-log-ip" title="IP-adress saknas i API-svaret.">
                                  <span aria-hidden="true">—</span>
                                  <span className="audit-log-sr-only">IP-adress saknas</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {pageError && (
                    <div className="audit-log-pagination-error">
                      <p className="audit-log-error" role="alert">
                        {pageError.message}
                      </p>
                      {pageError.requiresLogin && (
                        <Link to="/" className="audit-log-login-link">
                          Till inloggning
                        </Link>
                      )}
                    </div>
                  )}

                  <footer className="audit-log-footer">
                    <p className="audit-log-count" role="status" aria-atomic="true">
                      Visar {auditLog.entries.length} händelser i aktuell vy
                    </p>
                    <nav
                      className="audit-log-pagination"
                      aria-label="Besökta auditsidor"
                      title="Sidnumren visar endast vyer som har hämtats."
                    >
                      <Button
                        type="button"
                        className="audit-log-page-button"
                        onClick={() => loadKnownPage(navigation.index - 1)}
                        disabled={isLoadingPage || navigation.index === 0}
                        aria-busy={isLoadingPage}
                        title={
                          isLoadingPage
                            ? "Hämtar audithändelser..."
                            : navigation.index === 0
                            ? "Du är i den första vyn."
                            : "Visa föregående vy"
                        }
                        aria-label="Visa föregående vy"
                      >
                        <FiChevronLeft aria-hidden="true" />
                      </Button>
                      {pageSlots.map((slot) => typeof slot === "number" ? (
                        <Button
                          key={slot}
                          type="button"
                          className={`audit-log-page-button${slot === currentPage ? " audit-log-page-button--current" : ""}`}
                          onClick={() => loadKnownPage(slot - 1)}
                          disabled={isLoadingPage}
                          aria-label={`Sida ${slot}`}
                          aria-current={slot === currentPage ? "page" : undefined}
                        >
                          {slot}
                        </Button>
                      ) : (
                        <span key={slot} className="audit-log-page-ellipsis" aria-hidden="true">&hellip;</span>
                      ))}
                      <Button
                        type="button"
                        className="audit-log-page-button"
                        onClick={loadNextPage}
                        disabled={isLoadingPage || auditLog.nextCursor === null}
                        aria-busy={isLoadingPage}
                        title={
                          isLoadingPage
                            ? "Hämtar audithändelser..."
                            : auditLog.nextCursor === null
                            ? "Inga äldre händelser att visa."
                            : "Visa äldre händelser"
                        }
                        aria-label="Visa äldre händelser"
                      >
                        <FiChevronRight aria-hidden="true" />
                      </Button>
                      <span className="audit-log-sr-only" role="status">
                        {isLoadingPage ? "Hämtar audithändelser..." : ""}
                      </span>
                    </nav>
                  </footer>
                </>
              ) : null}
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
