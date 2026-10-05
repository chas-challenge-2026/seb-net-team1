import { useState } from "react";
import { LuCalendarDays, LuChevronDown, LuChevronUp } from "react-icons/lu";
import Card from "../shared/Card";
import StatusBadge from "../shared/StatusBadge";
import type { DashboardPayment } from "../../api/dashboardApi";

interface UpcomingPaymentsProps {
  payments: DashboardPayment[] | null;
  searchActive?: boolean;
}

export default function UpcomingPayments({
  payments,
  searchActive = false,
}: UpcomingPaymentsProps) {
  const [showAll, setShowAll] = useState(false);

  const formatAmount = (amount: number, currency: string) => {
    return `${new Intl.NumberFormat("sv-SE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)} ${currency}`;
  };

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat("sv-SE", {
      day: "numeric",
      month: "short",
    }).format(new Date(date));
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending_approval":
        return "Godkännande";
      case "processing":
        return "Pågående";
      default:
        return status;
    }
  };

  return (
    <Card className="upcoming-payments">
      <div className="dashboard-section__header">
        <h2>Kommande betalningar</h2>
        {payments !== null && payments.length > 3 && (
          <button
            type="button"
            className="dashboard-section__link"
            aria-expanded={showAll}
            onClick={() => setShowAll((expanded) => !expanded)}
          >
            {showAll ? "Visa färre" : "Visa alla"}
            {showAll ? <LuChevronUp /> : <LuChevronDown />}
          </button>
        )}
      </div>

      <div className="upcoming-payments__list">
        {payments === null ? (
          <div className="upcoming-payments__empty">Hämtar betalningar...</div>
        ) : payments.length === 0 ? (
          <div className="upcoming-payments__empty">
            <p>
              {searchActive
                ? "Inga betalningar matchar sökningen"
                : "Inga kommande betalningar"}
            </p>
          </div>
        ) : (
          (showAll ? payments : payments.slice(0, 3)).map((payment) => (
            <div
              className="upcoming-payments__item"
              key={payment.id}
            >
              <div className="upcoming-payments__icon">
                <LuCalendarDays />
              </div>

              <div className="upcoming-payments__info">
                <strong>{payment.reference}</strong>

                <span>
                  {formatDate(payment.createdAt)}
                </span>
              </div>

              <div className="upcoming-payments__details">
                <strong>
                  {formatAmount(payment.amount, payment.currency)}
                </strong>

                <StatusBadge
                  status={
                    payment.status === "pending_approval"
                      ? "pending"
                      : "processing"
                  }
                >
                  {getStatusLabel(payment.status)}
                </StatusBadge>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}