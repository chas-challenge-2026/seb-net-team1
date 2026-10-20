import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiSearch, FiSliders } from "react-icons/fi";
import { AuditLogApiError, getAuditLog, getAuditLogFilterOptions } from "../api/auditLogApi";
import AuditEntryDetails from "../components/audit/AuditEntryDetails";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import type { AuditEntry, AuditLogFilterOptions, AuditLogFilters, AuditLogResponse } from "../types/AuditLog";
import { buildAuditLogFilters, DEFAULT_AUDIT_FILTERS } from "../utils/auditFilters";
import type { AuditFilterValues } from "../utils/auditFilters";
import { formatAuditIpAddress, formatDateTime, formatEntity, getActionPresentation } from "../utils/auditPresentation";
import "../styles/dashboard.css";
import "../styles/auditLog.css";

type AuditLogError = {
  message: string;
  requiresLogin: boolean;
  accessDenied: boolean;
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

function getAuditLogError(error: unknown): AuditLogError {
  return {
    message:
      error instanceof AuditLogApiError
        ? error.message
        : error instanceof TypeError
        ? "Kunde inte nå backend-API:t. Kontrollera anslutningen och försök igen."
        : "Kunde inte hämta granskningsloggen. Försök igen.",
    requiresLogin: error instanceof AuditLogApiError && error.status === 401,
    accessDenied: error instanceof AuditLogApiError && error.status === 403,
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
  const [filterValues, setFilterValues] = useState<AuditFilterValues>(DEFAULT_AUDIT_FILTERS);
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [filterValidationError, setFilterValidationError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<AuditLogFilterOptions | null>(null);
  const [filterOptionsError, setFilterOptionsError] = useState<AuditLogError | null>(null);
  const [filterOptionsAttempt, setFilterOptionsAttempt] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPage = navigation.index + 1;
  const pageSlots = getReachedPageSlots(navigation.cursors.length, currentPage);
  const hasFilters = Boolean(filters.search || filters.action || filters.userId !== undefined || filters.from || filters.to);
  const hasFilterValues = Boolean(filterValues.search || filterValues.action || filterValues.userId || filterValues.dateRange !== "all");

  const loadPage = useCallback((request?: PageRequest) => {
    if (activeRequest.current) {
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    const isNavigation = request !== undefined;

    getAuditLog({ ...filters, cursor: request?.cursor, signal: controller.signal })
      .then((page) => {
        if (!controller.signal.aborted) {
          setAuditLog(page);
          setSelectedEntry(null);
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
          const auditError = getAuditLogError(error);
          if (auditError.accessDenied) {
            // A revoked permission ends pagination and removes previously loaded rows.
            setAuditLog(null);
            setSelectedEntry(null);
            setNavigation({ cursors: [undefined], index: 0 });
            setPageError(null);
            setInitialError(auditError);
          } else if (isNavigation) {
            setPageError(auditError);
          } else {
            setInitialError(auditError);
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
  }, [filters]);

  useEffect(() => {
    loadPage();

    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [loadPage]);

  useEffect(() => {
    const controller = new AbortController();
    getAuditLogFilterOptions(controller.signal)
      .then((options) => {
        if (!controller.signal.aborted) setFilterOptions(options);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const auditError = getAuditLogError(error);
        setFilterOptionsError(auditError);
        if (auditError.accessDenied || auditError.requiresLogin) {
          activeRequest.current?.abort();
          activeRequest.current = null;
          setAuditLog(null);
          setSelectedEntry(null);
          setNavigation({ cursors: [undefined], index: 0 });
          setInitialError(auditError);
          setIsLoading(false);
          setIsLoadingPage(false);
        }
      });

    return () => controller.abort();
  }, [filterOptionsAttempt]);

  useEffect(() => () => {
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
  }, []);

  function applyFilters(values: AuditFilterValues) {
    if (searchTimer.current !== null) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }

    let nextFilters: AuditLogFilters;
    try {
      nextFilters = buildAuditLogFilters(values);
    } catch (error: unknown) {
      setFilterValidationError(error instanceof Error ? error.message : "Kontrollera datumintervallet.");
      return;
    }

    activeRequest.current?.abort();
    activeRequest.current = null;
    setFilterValidationError(null);
    setInitialError(null);
    setPageError(null);
    setAuditLog(null);
    setSelectedEntry(null);
    setNavigation({ cursors: [undefined], index: 0 });
    setIsLoading(true);
    setIsLoadingPage(false);
    setFilters(nextFilters);
  }

  function changeFilters(change: Partial<AuditFilterValues>, debounce = false) {
    const nextValues = { ...filterValues, ...change };
    setFilterValues(nextValues);

    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    if (debounce) {
      searchTimer.current = setTimeout(() => applyFilters(nextValues), 300);
    } else {
      applyFilters(nextValues);
    }
  }

  function resetFilters() {
    setFilterValues(DEFAULT_AUDIT_FILTERS);
    applyFilters(DEFAULT_AUDIT_FILTERS);
  }

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
        </div>

        <div className="dashboard-content audit-log-content">
          <form
            className="audit-log-toolbar"
            aria-label="Sök och filtrera audit-loggen"
            onSubmit={(event) => { event.preventDefault(); applyFilters(filterValues); }}
          >
            <label className="audit-log-search">
              <FiSearch aria-hidden="true" />
              <span className="audit-log-sr-only">Sök loggar</span>
              <input
                type="search"
                name="search"
                placeholder="Sök loggar..."
                maxLength={200}
                value={filterValues.search}
                onChange={(event) => changeFilters({ search: event.target.value }, true)}
              />
            </label>
            <label className="audit-log-filter audit-log-filter--date">
              <select
                name="dateRange"
                aria-label="Period"
                value={filterValues.dateRange}
                onChange={(event) => changeFilters({ dateRange: event.target.value as AuditFilterValues["dateRange"] })}
              >
                <option value="all">Alla datum</option>
                <option value="today">Idag</option>
                <option value="7days">Senaste 7 dagarna</option>
                <option value="30days">Senaste 30 dagarna</option>
                <option value="custom">Eget intervall</option>
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
            <label className="audit-log-filter audit-log-filter--action">
              <select
                name="action"
                aria-label="Händelse"
                value={filterValues.action}
                onChange={(event) => changeFilters({ action: event.target.value })}
                disabled={filterOptions === null}
              >
                <option value="">Alla händelser</option>
                {filterOptions?.actions.map((action) => (
                  <option key={action} value={action}>
                    {getActionPresentation(action).tone === "neutral" ? action : getActionPresentation(action).label}
                  </option>
                ))}
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
            <label className="audit-log-filter audit-log-filter--user">
              <select
                name="userId"
                aria-label="Användare"
                value={filterValues.userId}
                onChange={(event) => changeFilters({ userId: event.target.value })}
                disabled={filterOptions === null}
              >
                <option value="">Alla användare</option>
                {filterOptions?.users.map((user) => <option key={user.id} value={String(user.id)}>{user.name}</option>)}
              </select>
              <FiChevronDown aria-hidden="true" />
            </label>
            <Button
              type="submit"
              className="audit-log-filter-button"
            >
              <FiSliders aria-hidden="true" />
              Filtrera
            </Button>
            {hasFilterValues && (
              <button type="button" className="audit-log-reset-button" onClick={resetFilters}>Rensa filter</button>
            )}
            {filterValues.dateRange === "custom" && (
              <div className="audit-log-custom-dates">
                <label>
                  Från och med
                  <input
                    name="fromDate"
                    type="date"
                    value={filterValues.fromDate}
                    max={filterValues.toDate || undefined}
                    onChange={(event) => changeFilters({ fromDate: event.target.value })}
                  />
                </label>
                <label>
                  Till och med
                  <input
                    name="toDate"
                    type="date"
                    value={filterValues.toDate}
                    min={filterValues.fromDate || undefined}
                    onChange={(event) => changeFilters({ toDate: event.target.value })}
                  />
                </label>
              </div>
            )}
            {filterValidationError && <p className="audit-log-filter-error" role="alert">{filterValidationError}</p>}
            {filterOptionsError && (
              <div className="audit-log-filter-error">
                <p role="alert">Kunde inte hämta filtervalen. {filterOptionsError.message}</p>
                {filterOptionsError.requiresLogin ? (
                  <Link to="/" className="audit-log-login-link">Till inloggning</Link>
                ) : !filterOptionsError.accessDenied ? (
                  <button
                    type="button"
                    className="audit-log-reset-button"
                    onClick={() => {
                      setFilterOptionsError(null);
                      setFilterOptionsAttempt((current) => current + 1);
                    }}
                  >Försök igen</button>
                ) : null}
              </div>
            )}
          </form>

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
                  ) : !initialError.accessDenied ? (
                    <Button
                      type="button"
                      className="audit-log-button"
                      onClick={retryInitialLoad}
                    >
                      Försök igen
                    </Button>
                  ) : null}
                </div>
              ) : auditLog ? (
                <>
                  {auditLog.entries.length === 0 ? (
                    <p className="audit-log-state" role="status">
                      {hasFilters ? "Inga händelser matchar din sökning eller dina filter." : "Det finns inga audithändelser att visa."}
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
                            const ipAddress = formatAuditIpAddress(entry.ipAddress);

                            return (
                              <tr key={entry.id}>
                                <td className="audit-log-date">
                                  <time dateTime={entry.createdAt}>
                                    {formatDateTime(entry.createdAt)}
                                  </time>
                                </td>
                                <td className="audit-log-user">{entry.userName || "—"}</td>
                                <td>
                                  <button
                                    type="button"
                                    className={`audit-log-entry-button audit-log-action audit-log-action--${action.tone}`}
                                    onClick={() => setSelectedEntry(entry)}
                                    aria-label={`Visa hela händelsen: ${action.label}, audit #${entry.id}`}
                                    aria-haspopup="dialog"
                                    aria-controls="audit-entry-details"
                                  >
                                    {action.label}
                                  </button>
                                </td>
                                <td className="audit-log-details">
                                  <button
                                    type="button"
                                    className="audit-log-entry-button audit-log-description"
                                    title={entry.description || "—"}
                                    onClick={() => setSelectedEntry(entry)}
                                    aria-label={`Visa detaljer för audit #${entry.id}`}
                                    aria-haspopup="dialog"
                                    aria-controls="audit-entry-details"
                                  >
                                    {entry.description || "—"}
                                  </button>
                                  <p className="audit-log-metadata">
                                    {entity && <span>{entity}</span>}
                                    <span>Audit #{entry.id}</span>
                                  </p>
                                </td>
                                <td className="audit-log-ip">
                                  {ipAddress ?? <>
                                    <span aria-hidden="true">—</span>
                                    <span className="audit-log-sr-only">IP-adress saknas</span>
                                  </>}
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
      {selectedEntry && (
        <AuditEntryDetails
          key={selectedEntry.id}
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
