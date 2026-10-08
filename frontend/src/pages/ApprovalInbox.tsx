import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiCheckCircle, FiClock, FiRefreshCw } from "react-icons/fi";
import { ApprovalApiError, getApprovalInbox } from "../api/approvalsApi";
import ApprovalDetails from "../components/approvals/ApprovalDetails";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Sidebar from "../components/dashboard/Sidebar";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import StatusBadge from "../components/shared/StatusBadge";
import type { PendingApproval } from "../types/Approval";
import "../styles/dashboard.css";
import "../styles/approvalInbox.css";

type InboxError = {
  message: string;
  status?: number;
};

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function formatAmount(amount: string, currency: string): string {
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency,
  }).format(Number(amount));
}

export default function ApprovalInbox() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pending, setPending] = useState<PendingApproval[] | null>(null);
  const [error, setError] = useState<InboxError | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const selectedApproval = pending?.find((approval) => approval.approvalStepId === selectedStepId);
  const isLoading = pending === null && error === null;

  useEffect(() => {
    const controller = new AbortController();

    getApprovalInbox({ signal: controller.signal })
      .then((inbox) => {
        if (!controller.signal.aborted) {
          setPending(inbox.pending);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError({
            message:
              cause instanceof ApprovalApiError
                ? cause.message
                : cause instanceof TypeError
                  ? "Kunde inte nå servern. Kontrollera anslutningen och försök igen."
                  : "Kunde inte hämta väntande betalningar. Försök igen.",
            status: cause instanceof ApprovalApiError ? cause.status : undefined,
          });
        }
      });

    return () => controller.abort();
  }, [requestVersion]);

  function refreshInbox() {
    setSelectedStepId(null);
    setPending(null);
    setError(null);
    setRequestVersion((version) => version + 1);
  }

  return (
    <div className="dashboard-layout approval-inbox-layout">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((isOpen) => !isOpen)}
        onClose={() => setIsSidebarOpen(false)}
        pendingApprovalCount={pending?.length}
      />

      <button
        type="button"
        className={`sidebar-overlay${isSidebarOpen ? " is-open" : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Stäng meny"
      />

      <main className="dashboard-main approval-inbox-main">
        <DashboardHeader
          title="Godkännanden"
          subtitle="Betalningar som väntar på godkännande."
          showSearch={false}
        />

        <div className="dashboard-content approval-inbox-content">
          <section aria-labelledby="approval-inbox-heading">
            <Card className="approval-inbox-card">
              <div className="approval-inbox-card-header">
                <div className="approval-inbox-title">
                  <FiClock aria-hidden="true" />
                  <h2 id="approval-inbox-heading">Väntande betalningar</h2>
                  {pending !== null && (
                    <span className="approval-inbox-count" aria-label={`${pending.length} väntande betalningar`}>
                      {pending.length}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  className="approval-inbox-button"
                  onClick={refreshInbox}
                  disabled={isLoading}
                  aria-busy={isLoading}
                >
                  <FiRefreshCw aria-hidden="true" />
                  Uppdatera
                </Button>
              </div>

              {isLoading ? (
                <p className="approval-inbox-state" role="status">
                  Hämtar väntande betalningar...
                </p>
              ) : error ? (
                <div className="approval-inbox-state">
                  <p className="approval-inbox-error" role="alert">{error.message}</p>
                  {error.status === 401 ? (
                    <Link to="/" className="approval-inbox-link">Till inloggning</Link>
                  ) : error.status === 403 ? (
                    <Link to="/dashboard" className="approval-inbox-link">Till översikten</Link>
                  ) : (
                    <Button type="button" className="approval-inbox-button" onClick={refreshInbox}>
                      Försök igen
                    </Button>
                  )}
                </div>
              ) : pending?.length === 0 ? (
                <div className="approval-inbox-state" role="status">
                  <FiCheckCircle className="approval-inbox-empty-icon" aria-hidden="true" />
                  <h3>Inga väntande betalningar</h3>
                  <p>Här visas betalningar när de behöver godkännas.</p>
                </div>
              ) : (
                <div className="approval-inbox-table-scroll" role="region" aria-label="Väntande betalningar" tabIndex={0}>
                  <table className="approval-inbox-table">
                    <caption className="approval-inbox-sr-only">Betalningar som väntar på godkännande</caption>
                    <thead>
                      <tr>
                        <th scope="col">Referens</th>
                        <th scope="col">Mottagarkonto</th>
                        <th scope="col" className="approval-inbox-amount">Belopp</th>
                        <th scope="col">Skapad</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending?.map((approval) => (
                        <tr key={approval.approvalStepId}>
                          <td className="approval-inbox-reference">
                            <button
                              type="button"
                              className="approval-inbox-reference-button"
                              onClick={() => setSelectedStepId(approval.approvalStepId)}
                              aria-label={`Visa detaljer för ${approval.reference || `betalning #${approval.paymentId}`}`}
                              aria-haspopup="dialog"
                            >
                              {approval.reference || `Betalning #${approval.paymentId}`}
                            </button>
                          </td>
                          <td className="approval-inbox-iban">{approval.toIban}</td>
                          <td className="approval-inbox-amount">{formatAmount(approval.amount, approval.currency)}</td>
                          <td><time dateTime={approval.createdAt}>{formatDate(approval.createdAt)}</time></td>
                          <td><StatusBadge status="pending">Väntar på godkännande</StatusBadge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>
        </div>
      </main>
      {selectedApproval && (
        <ApprovalDetails approval={selectedApproval} onClose={() => setSelectedStepId(null)} />
      )}
    </div>
  );
}
