import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { FiBarChart2, FiCalendar, FiSearch } from "react-icons/fi";
import { getPaymentReport, ReportApiError } from "../api/reportsApi";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import StatusBadge from "../components/shared/StatusBadge";
import type { PaymentReport, ReportPeriod } from "../types/Report";
import { getDefaultReportPeriod, getReportPeriodError } from "../utils/reportPeriod";
import "../styles/dashboard.css";
import "../styles/reports.css";

type ReportRequest = ReportPeriod & { version: number };
type ReportError = { key: string; message: string; status?: number };

const createdAtFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit",
});

function requestKey(request: ReportRequest): string {
  return `${request.from}|${request.to}|${request.version}`;
}

function PaymentStatus({ status }: { status: string }) {
  switch (status) {
    case "completed": return <StatusBadge status="success">Genomförd</StatusBadge>;
    case "pending_approval": return <StatusBadge status="pending">Väntar på godkännande</StatusBadge>;
    case "rejected": return <StatusBadge status="rejected">Avvisad</StatusBadge>;
    case "failed": return <StatusBadge status="failed">Misslyckad</StatusBadge>;
    case "processing": return <StatusBadge status="processing">Behandlas</StatusBadge>;
    default: return <StatusBadge>Okänd status</StatusBadge>;
  }
}

export default function Reports() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [period, setPeriod] = useState(getDefaultReportPeriod);
  const [request, setRequest] = useState<ReportRequest | null>(() => ({ ...period, version: 0 }));
  const [result, setResult] = useState<{ key: string; report: PaymentReport } | null>(null);
  const [error, setError] = useState<ReportError | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const nextVersion = useRef(0);
  const key = request ? requestKey(request) : null;
  const report = result?.key === key ? result.report : null;
  const reportError = error?.key === key ? error : null;
  const isLoading = request !== null && report === null && reportError === null;

  useEffect(() => {
    if (!request) return;
    const controller = new AbortController();
    const activeKey = requestKey(request);
    getPaymentReport({ from: request.from, to: request.to, signal: controller.signal })
      .then((report) => {
        if (!controller.signal.aborted) setResult({ key: activeKey, report });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError({
            key: activeKey,
            message: cause instanceof ReportApiError ? cause.message
              : cause instanceof TypeError ? "Kunde inte nå servern. Kontrollera anslutningen och försök igen."
                : "Kunde inte hämta rapporten. Försök igen.",
            status: cause instanceof ReportApiError ? cause.status : undefined,
          });
        }
      });
    return () => controller.abort();
  }, [request]);

  function changePeriod(field: keyof ReportPeriod, value: string) {
    setPeriod((current) => ({ ...current, [field]: value }));
    setRequest(null);
    setValidationError(null);
  }

  function loadReport(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const error = getReportPeriodError(period.from, period.to);
    setValidationError(error);
    if (error) {
      setRequest(null);
      return;
    }
    nextVersion.current += 1;
    setRequest({ ...period, version: nextVersion.current });
  }

  return (
    <div className="dashboard-layout reports-layout">
      <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen((open) => !open)}
        onClose={() => setIsSidebarOpen(false)} />
      <button type="button" className={`sidebar-overlay${isSidebarOpen ? " is-open" : ""}`}
        onClick={() => setIsSidebarOpen(false)} aria-label="Stäng meny" />
      <main className="dashboard-main reports-main">
        <DashboardHeader title="Rapporter" subtitle="Visa betalningar för en vald period." showSearch={false} />
        <div className="dashboard-content reports-content">
          <section aria-labelledby="reports-period-heading">
            <Card className="reports-filter-card">
              <div className="reports-title">
                <FiCalendar aria-hidden="true" /><h2 id="reports-period-heading">Välj period</h2>
              </div>
              <p className="reports-description" id="reports-period-description">
                Rapporten visar betalningar som skapats under perioden, oavsett status.
                Båda datumen räknas med enligt svensk tid.
              </p>
              <form className="reports-form" onSubmit={loadReport} noValidate>
                <div className="reports-field">
                  <label htmlFor="reports-from">Från-datum</label>
                  <input id="reports-from" name="from" type="date" required max="9999-12-30"
                    value={period.from} onChange={(event) => changePeriod("from", event.target.value)}
                    aria-invalid={validationError !== null}
                    aria-describedby={validationError ? "reports-period-description reports-period-error" : "reports-period-description"} />
                </div>
                <div className="reports-field">
                  <label htmlFor="reports-to">Till-datum</label>
                  <input id="reports-to" name="to" type="date" required max="9999-12-30"
                    value={period.to} onChange={(event) => changePeriod("to", event.target.value)}
                    aria-invalid={validationError !== null}
                    aria-describedby={validationError ? "reports-period-description reports-period-error" : "reports-period-description"} />
                </div>
                <Button className="reports-button" type="submit" disabled={isLoading}>
                  <FiSearch aria-hidden="true" />Visa rapport
                </Button>
              </form>
              {validationError && <p className="reports-error reports-validation" id="reports-period-error" role="alert">{validationError}</p>}
            </Card>
          </section>

          <section aria-labelledby="reports-payments-heading" aria-busy={isLoading}>
            <Card className="reports-results-card">
              <div className="reports-results-header">
                <div className="reports-title">
                  <FiBarChart2 aria-hidden="true" /><h2 id="reports-payments-heading">Betalningar</h2>
                  {report && <span className="reports-count">{report.payments.length} betalningar</span>}
                </div>
                {request && <p className="reports-applied-period">Period: <time dateTime={request.from}>{request.from}</time> – <time dateTime={request.to}>{request.to}</time></p>}
              </div>
              {isLoading ? <p className="reports-state" role="status">Hämtar rapporten...</p>
                : reportError ? (
                  <div className="reports-state">
                    <p className="reports-error" role="alert">{reportError.message}</p>
                    {reportError.status === 401 ? <Link className="reports-link" to="/">Till inloggning</Link>
                      : reportError.status === 403 ? <Link className="reports-link" to="/dashboard">Till översikten</Link>
                        : <Button className="reports-button" type="button" onClick={() => loadReport()}>Försök igen</Button>}
                  </div>
                ) : !report ? <p className="reports-state" role="status">Välj period och klicka på Visa rapport.</p>
                  : report.payments.length === 0 ? <p className="reports-state" role="status">Inga betalningar under vald period.</p>
                    : (
                      <div className="reports-table-scroll" role="region" aria-label="Betalningar för vald period" tabIndex={0}>
                        <table className="reports-table">
                          <caption className="reports-sr-only">Betalningar skapade från {report.from} till {report.to}, enligt svensk tid.</caption>
                          <thead><tr>
                            <th scope="col">Referens</th><th scope="col">Avsändarkonto</th><th scope="col">Mottagarkonto</th>
                            <th scope="col" className="reports-amount">Belopp</th><th scope="col">Skapad</th><th scope="col">Status</th>
                          </tr></thead>
                          <tbody>{report.payments.map((payment) => (
                            <tr key={payment.id}>
                              <td className="reports-reference">{payment.reference.trim() || `Betalning #${payment.id}`}</td>
                              <td>{payment.fromAccountName || "Uppgift saknas"}</td>
                              <td className="reports-iban">{payment.toIban}</td>
                              <td className="reports-amount">{new Intl.NumberFormat("sv-SE", { style: "currency", currency: payment.currency }).format(Number(payment.amount))}</td>
                              <td><time dateTime={payment.createdAt}>{createdAtFormatter.format(new Date(payment.createdAt))}</time></td>
                              <td><PaymentStatus status={payment.status} /></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
