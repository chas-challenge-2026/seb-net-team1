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
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<AuditLogError | null>(null);
  const [hasLoadedMore, setHasLoadedMore] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  const loadPage = useCallback((cursor?: string) => {
    if (activeRequest.current) {
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    const isNextPage = cursor !== undefined;

    getAuditLog({ cursor, signal: controller.signal })
      .then((page) => {
        if (!controller.signal.aborted) {
          setAuditLog((current) =>
            isNextPage && current
              ? {
                  entries: [...current.entries, ...page.entries],
                  nextCursor: page.nextCursor,
                }
              : page
          );
          setHasLoadedMore(isNextPage);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          if (isNextPage) {
            setLoadMoreError(getAuditLogError(error));
          } else {
            setInitialError(getAuditLogError(error));
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          if (isNextPage) {
            setIsLoadingMore(false);
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

  function loadMore() {
    if (activeRequest.current || auditLog?.nextCursor == null) {
      return;
    }

    setLoadMoreError(null);
    setIsLoadingMore(true);
    loadPage(auditLog.nextCursor);
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
          <DashboardHeader title="Audit-logg" subtitle="" showSearch={false} />
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
          <div className="audit-log-intro">
            <h2 id="audit-log-heading">Audit-logg</h2>
            <p>Registrerade händelser för ditt företag.</p>
          </div>

          <fieldset
            className="audit-log-toolbar"
            aria-describedby="audit-log-filter-availability"
            title="Sökning och filtrering är inte tillgängliga ännu."
          >
            <legend className="audit-log-sr-only">Sök och filtrera audit-loggen</legend>
            <p id="audit-log-filter-availability" className="audit-log-sr-only">
              Sökning och filtrering är inte tillgängliga ännu.
            </p>
            <label className="audit-log-search">
              <FiSearch aria-hidden="true" />
              <span className="audit-log-sr-only">Sök loggar</span>
              <input type="search" name="search" placeholder="Sök loggar..." />
            </label>
            <label className="audit-log-filter">
              <span>Date range:</span>
              <select name="dateRange" aria-label="Period" defaultValue="all">
                <option value="all">All</option>
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
            <label className="audit-log-filter">
              <span>Action:</span>
              <select name="action" aria-label="Händelse" defaultValue="all">
                <option value="all">All</option>
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
            <label className="audit-log-filter">
              <span>User:</span>
              <select name="user" aria-label="Användare" defaultValue="all">
                <option value="all">All</option>
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
            <Button type="button" className="audit-log-filter-button">
              <FiSliders aria-hidden="true" />
              Filters
            </Button>
          </fieldset>

          <section className="audit-log-results" aria-labelledby="audit-log-heading">
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
                      aria-busy={isLoadingMore}
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

                  {loadMoreError && (
                    <div className="audit-log-pagination-error">
                      <p className="audit-log-error" role="alert">
                        {loadMoreError.message}
                      </p>
                      {loadMoreError.requiresLogin && (
                        <Link to="/" className="audit-log-login-link">
                          Till inloggning
                        </Link>
                      )}
                    </div>
                  )}

                  <footer className="audit-log-footer">
                    <p className="audit-log-count" role="status" aria-atomic="true">
                      Visar {auditLog.entries.length} inlästa händelser
                    </p>
                    <div className="audit-log-pagination" role="group" aria-label="Sidkontroller">
                      <Button
                        type="button"
                        className="audit-log-page-button"
                        disabled
                        title="Bakåtnavigering är inte tillgänglig."
                        aria-label="Föregående vy, inte tillgänglig"
                      >
                        <FiChevronLeft aria-hidden="true" />
                      </Button>
                      {/* Numbers mirror the design only; the API provides cursors, not page numbers. */}
                      <Button
                        type="button"
                        className={`audit-log-page-button${hasLoadedMore ? "" : " audit-log-page-button--current"}`}
                        disabled
                        aria-current={hasLoadedMore ? undefined : "page"}
                        aria-label="Första vyn, endast visuell markering"
                        title="Sidnummer är visuella platshållare utan sidnavigering."
                      >
                        1
                      </Button>
                      {[2, 3].map((number) => (
                        <Button
                          key={number}
                          type="button"
                          className="audit-log-page-button"
                          disabled
                          aria-label={`Siffra ${number}, endast visuell platshållare`}
                          title="Sidnummer är visuella platshållare utan sidnavigering."
                        >
                          {number}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        className="audit-log-page-button audit-log-page-button--next"
                        onClick={loadMore}
                        disabled={isLoadingMore || auditLog.nextCursor === null}
                        aria-busy={isLoadingMore}
                        title={
                          auditLog.nextCursor === null
                            ? "Inga äldre händelser att visa."
                            : isLoadingMore
                            ? "Hämtar fler..."
                            : loadMoreError
                            ? "Försök igen"
                            : "Visa äldre händelser"
                        }
                        aria-label={
                          auditLog.nextCursor === null
                            ? "Inga äldre händelser att visa"
                            : isLoadingMore
                            ? "Hämtar fler audithändelser"
                            : loadMoreError
                            ? "Försök hämta äldre händelser igen"
                            : "Visa äldre händelser"
                        }
                      >
                        <FiChevronRight aria-hidden="true" />
                      </Button>
                      <span className="audit-log-sr-only" role="status">
                        {isLoadingMore ? "Hämtar fler audithändelser..." : ""}
                      </span>
                    </div>
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
