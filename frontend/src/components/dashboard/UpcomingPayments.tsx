import { useEffect, useState } from "react";
import { LuArrowRight, LuCalendarDays } from "react-icons/lu";
import Card from "../shared/Card";
import StatusBadge from "../shared/StatusBadge";

interface Payment {
  id: number;
  toIban: string;
  amount: number;
  currency: string;
  reference: string;
  status: string;
  createdAt: string;
}

export default function UpcomingPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    fetch("http://localhost:3001/payments")
      .then((response) => response.json())
      .then((data) => {
        const upcomingPayments = data
          .filter(
            (payment: Payment) =>
              payment.status === "pending_approval" ||
              payment.status === "processing"
          )
          .slice(0, 3);

        setPayments(upcomingPayments);
      })
      .catch((error) => {
        console.error("Kunde inte hämta kommande betalningar:", error);
      });
  }, []);

  const formatAmount = (amount: number, currency: string) => {
    return `${new Intl.NumberFormat("sv-SE").format(amount)} ${currency}`;
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

        <button className="dashboard-section__link">
          Visa alla
          <LuArrowRight />
        </button>
      </div>

      <div className="upcoming-payments__list">
        {payments.length === 0 ? (
          <div className="upcoming-payments__empty">
            <p>Inga kommande betalningar</p>
          </div>
        ) : (
          payments.map((payment) => (
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