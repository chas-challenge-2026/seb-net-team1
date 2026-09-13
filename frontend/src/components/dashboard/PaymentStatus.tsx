import { useEffect, useState } from "react";
import {LuArrowRight, LuCircleCheck, LuClock3, LuCircleX, LuCircleAlert,} from "react-icons/lu";
import Card from "../shared/Card";
import StatusBadge from "../shared/StatusBadge";

interface Payment {
  id: number;
  status: string;
}

export default function PaymentStatus() {
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    fetch("http://localhost:3001/payments")
      .then((response) => response.json())
      .then((data) => setPayments(data))
      .catch((error) => {
        console.error("Kunde inte hämta betalningar:", error);
      });
  }, []);

  const completed = payments.filter(
    (payment) => payment.status === "completed"
  ).length;

  const ongoing = payments.filter(
    (payment) => payment.status === "processing"
  ).length;

  const pendingApproval = payments.filter(
    (payment) => payment.status === "pending_approval"
  ).length;

  const rejected = payments.filter(
    (payment) => payment.status === "rejected"
  ).length;

  const failed = payments.filter(
    (payment) => payment.status === "failed"
  ).length;

  return (
    <Card className="payment-status">
      <div className="dashboard-section__header">
        <h2>Betalningsstatus</h2>

        <button className="dashboard-section__link">
          Visa rapport
          <LuArrowRight />
        </button>
      </div>

      <div className="payment-status__list">

        {/* Genomförda */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuCircleCheck />
            <span>Genomförda</span>
          </div>

          <StatusBadge status="success">
            {completed}
          </StatusBadge>
        </div>

        {/* Pågående */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuClock3 />
            <span>Pågående</span>
          </div>

          <StatusBadge status="processing">
            {ongoing}
          </StatusBadge>
        </div>

        {/* Väntar på godkännande */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuClock3 />
            <span>Väntar på godkännande</span>
          </div>

          <StatusBadge status="pending">
            {pendingApproval}
          </StatusBadge>
        </div>

        {/* Avvisade */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuCircleX />
            <span>Avvisade</span>
          </div>

          <StatusBadge status="rejected">
            {rejected}
          </StatusBadge>
        </div>

        {/* Misslyckade */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuCircleAlert />
            <span>Misslyckade</span>
          </div>

          <StatusBadge status="failed">
            {failed}
          </StatusBadge>
        </div>

      </div>
    </Card>
  );
}