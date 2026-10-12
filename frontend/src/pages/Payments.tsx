import { useState } from "react";
import { Link } from "react-router-dom";
import {
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiPlus,
  FiRefreshCw,
  FiUploadCloud,
} from "react-icons/fi";
import PaymentsLayout from "../components/payments/PaymentsLayout";
import Button from "../components/shared/Button";
import Card from "../components/shared/Card";
import StatusBadge from "../components/shared/StatusBadge";
import { usePaymentOverview } from "../hooks/usePaymentOverview";
import {
  formatPaymentAmount,
  formatPaymentId,
  formatPaymentListDate,
  getPaymentStatus,
} from "../utils/paymentPresentation";
import { DEFAULT_PAYMENT_FILTERS, filterRecentPayments } from "../utils/paymentListFilters";
import type { PaymentAmountRange, PaymentDateRange, PaymentListFilters } from "../utils/paymentListFilters";
import { getPaymentPagination } from "../utils/paymentPagination";

const PAGE_SIZE = 10;
const dateOptions: { value: PaymentDateRange; label: string }[] = [
  { value: "all", label: "Alla datum" },
  { value: "7", label: "Senaste 7 dagarna" },
  { value: "30", label: "Senaste 30 dagarna" },
  { value: "90", label: "Senaste 90 dagarna" },
];
const amountOptions: { value: PaymentAmountRange; label: string }[] = [
  { value: "all", label: "Alla" },
  { value: "under10000", label: "Under 10 000 kr" },
  { value: "10000to50000", label: "10 000–50 000 kr" },
  { value: "50000to100000", label: "50 000–100 000 kr" },
  { value: "over100000", label: "Över 100 000 kr" },
];

export default function Payments() {
  const { data, isLoading, error, needsLogin, retry } = usePaymentOverview();
  const [filters, setFilters] = useState(DEFAULT_PAYMENT_FILTERS);
  const [page, setPage] = useState(1);
  const payments = data?.recentPayments ?? [];
  const now = new Date();
  const filteredPayments = filterRecentPayments(payments, filters, now);
  const pagination = getPaymentPagination({ totalItems: filteredPayments.length, pageSize: PAGE_SIZE, page });
  const visiblePayments = filteredPayments.slice(pagination.startIndex, pagination.endIndex);
  const paginationDisabled = isLoading || Boolean(error) || filteredPayments.length === 0;
  const statuses = [...new Set([
    "completed", "pending_approval", "rejected",
    ...payments.map((payment) => payment.status).filter((status): status is string => Boolean(status)),
  ])];

  function changeFilters(update: Partial<PaymentListFilters>) {
    setFilters((current) => ({ ...current, ...update }));
    setPage(1);
  }

  return (
    <PaymentsLayout
      title="Betalningar"
      subtitle="Skapa, granska och spåra alla företagets utgående betalningar."
      overview={data}
      contentClassName="payments-list-content"
    >
      <div className="payments-top-actions">
        <Link to="/batch-upload" className="payments-action payments-action--secondary">
          <FiUploadCloud aria-hidden="true" />Ladda upp betalfil
        </Link>
        <Link to="/new-payment" className="payments-action payments-action--primary">
          <FiPlus aria-hidden="true" />Ny betalning
        </Link>
      </div>

      <div className="payments-toolbar" role="group" aria-label="Filtrera de inlästa senaste betalningarna">
        <label className={`payments-filter${filters.status !== "all" ? " payments-filter--status-selected" : ""}`}>
          <select
            aria-label="Status för inlästa betalningar"
            value={filters.status}
            onChange={(event) => changeFilters({ status: event.target.value })}
          >
            <option value="all">Status: Alla</option>
            {statuses.map((status) => <option key={status} value={status}>Status: {getPaymentStatus(status).label}</option>)}
          </select>
          <FiChevronDown aria-hidden="true" />
        </label>
        <label className="payments-filter payments-filter--date">
          <select
            aria-label="Datumintervall för inlästa betalningar"
            value={filters.dateRange}
            onChange={(event) => {
              const value = dateOptions.find((option) => option.value === event.target.value)?.value;
              if (value) changeFilters({ dateRange: value });
            }}
          >
            {dateOptions.map((option) => <option key={option.value} value={option.value}>Datumintervall: {option.label}</option>)}
          </select>
          <FiChevronDown aria-hidden="true" />
        </label>
        <label className={`payments-filter${filters.amountRange !== "all" ? " payments-filter--amount-selected" : ""}`}>
          <select
            aria-label="Belopp i SEK för inlästa betalningar"
            value={filters.amountRange}
            onChange={(event) => {
              const value = amountOptions.find((option) => option.value === event.target.value)?.value;
              if (value) changeFilters({ amountRange: value });
            }}
          >
            {amountOptions.map((option) => <option key={option.value} value={option.value}>Belopp: {option.label}</option>)}
          </select>
          <FiChevronDown aria-hidden="true" />
        </label>
        <label className="payments-filter" title="Kontofiltrering kräver avsändarkonto i betalningsdata">
          <select aria-label="Konto, endast Alla är tillgängligt" defaultValue="all">
            <option value="all">Konto: Alla</option>
          </select>
          <FiChevronDown aria-hidden="true" />
        </label>
        <Button type="button" className="payments-reset" onClick={() => changeFilters(DEFAULT_PAYMENT_FILTERS)}>
          <FiRefreshCw aria-hidden="true" />Rensa filter
        </Button>
      </div>

      <Card className="payments-table-card">
        <div className="payments-table-scroll" role="region" aria-label="Senaste betalningar" tabIndex={0}>
          <table className="payments-table">
            <caption className="payments-sr-only">
              Filtren gäller endast de inlästa senaste betalningarna från företagets
              kontoöversikt, inte hela betalningshistoriken. Sidindelningen gäller endast dessa inlästa betalningar.
            </caption>
            <colgroup>
              <col className="payments-col-id" />
              <col /><col /><col /><col /><col />
              <col className="payments-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Referens-ID</th>
                <th scope="col">Mottagare</th>
                <th scope="col">Konto</th>
                <th scope="col">Belopp</th>
                <th scope="col">Status</th>
                <th scope="col">Skapad datum</th>
                <th scope="col">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {visiblePayments.map((payment) => {
                const status = getPaymentStatus(payment.status);
                return (
                  <tr key={payment.id}>
                    <td>
                      <Link
                        to={`/payments/${payment.id}`}
                        className="payments-id"
                        title={formatPaymentId(payment.id)}
                        aria-label={`Visa betalning ${formatPaymentId(payment.id)}`}
                      >
                        {formatPaymentId(payment.id)}
                      </Link>
                    </td>
                    <td className="payments-recipient" title={payment.toIban ?? undefined}>
                      {payment.toIban ?? "—"}
                    </td>
                    <td>—</td>
                    <td className="payments-amount">
                      {formatPaymentAmount(payment.amount, payment.currency)}
                    </td>
                    <td>
                      <StatusBadge status={status.variant} className="payments-status">{status.label}</StatusBadge>
                    </td>
                    <td className="payments-date">
                      <time dateTime={payment.createdAt} title={payment.createdAt}>
                        {formatPaymentListDate(payment.createdAt, now)}
                      </time>
                    </td>
                    <td>
                      <Link to={`/payments/${payment.id}`} className="payments-manage" aria-label={`Hantera betalning ${payment.id}`}>
                        Hantera
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isLoading || error || visiblePayments.length === 0 ? (
          <div className="payments-table-state">
            {isLoading ? (
              <p role="status">Laddar betalningar...</p>
            ) : error ? (
              <>
                <p role="alert" className="payments-error">{error}</p>
                {needsLogin ? (
                  <Link to="/" className="payments-text-link">Logga in</Link>
                ) : (
                  <Button type="button" className="payments-action payments-action--secondary" onClick={retry}>
                    <FiRefreshCw aria-hidden="true" />Försök igen
                  </Button>
                )}
              </>
            ) : (
              <p role="status">
                {payments.length === 0 ? "Inga senaste betalningar att visa." : "Inga inlästa betalningar matchar filtren."}
              </p>
            )}
          </div>
        ) : null}
        <footer className="payments-table-footer">
          <p className="payments-result-count" role="status">
            {isLoading ? "Laddar..." : error ? "—" : pagination.totalPages > 1
              ? `Visar ${pagination.startIndex + 1}–${pagination.endIndex} av ${filteredPayments.length} ${filteredPayments.length === payments.length ? "inlästa" : "filtrerade"} senaste betalningar`
              : filteredPayments.length === payments.length
              ? `Visar ${payments.length} senaste betalningar`
              : `Visar ${filteredPayments.length} av ${payments.length} inlästa senaste betalningar`}
          </p>
          <nav className="payments-pagination" aria-label="Sidor för inlästa senaste betalningar" title="Sidindelningen gäller endast inlästa senaste betalningar">
            <Button
              type="button"
              className="payments-page-button"
              disabled={paginationDisabled || pagination.currentPage <= 1}
              aria-label="Föregående sida"
              onClick={() => setPage(pagination.currentPage - 1)}
            >
              <FiChevronLeft aria-hidden="true" />
            </Button>
            {pagination.pages.map((slot) => typeof slot === "number" ? (
              <Button
                key={slot}
                type="button"
                className={`payments-page-button${slot === pagination.currentPage ? " payments-page-button--current" : ""}`}
                disabled={paginationDisabled}
                aria-label={`Sida ${slot}`}
                aria-current={slot === pagination.currentPage ? "page" : undefined}
                onClick={() => setPage(slot)}
              >{slot}</Button>
            ) : (
              <span key={slot} className="payments-page-ellipsis" aria-hidden="true">&hellip;</span>
            ))}
            <Button
              type="button"
              className="payments-page-button"
              disabled={paginationDisabled || pagination.currentPage >= pagination.totalPages}
              aria-label="Nästa sida"
              onClick={() => setPage(pagination.currentPage + 1)}
            >
              <FiChevronRight aria-hidden="true" />
            </Button>
          </nav>
        </footer>
      </Card>
    </PaymentsLayout>
  );
}
