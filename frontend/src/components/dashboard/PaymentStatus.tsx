import {LuArrowRight, LuCircleCheck, LuClock3, LuCircleX, LuCircleAlert,} from "react-icons/lu";
import { Link } from "react-router-dom";
import Card from "../shared/Card";
import StatusBadge from "../shared/StatusBadge";
import type { DashboardPaymentStatusCounts } from "../../api/dashboardApi";

interface PaymentStatusProps {
  counts: DashboardPaymentStatusCounts | null;
}

export default function PaymentStatus({ counts }: PaymentStatusProps) {

  return (
    <Card className="payment-status">
      <div className="dashboard-section__header">
        <h2>Betalningsstatus</h2>

        <Link to="/reports" className="dashboard-section__link">
          Visa rapport
          <LuArrowRight />
        </Link>
      </div>

      <div className="payment-status__list">

        {/* Genomförda */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuCircleCheck />
            <span>Genomförda</span>
          </div>

          <StatusBadge status="success">
            {counts?.completed ?? "—"}
          </StatusBadge>
        </div>

        {/* Pågående */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuClock3 />
            <span>Pågående</span>
          </div>

          <StatusBadge status="processing">
            {counts?.processing ?? "—"}
          </StatusBadge>
        </div>

        {/* Väntar på godkännande */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuClock3 />
            <span>Väntar på godkännande</span>
          </div>

          <StatusBadge status="pending">
            {counts?.pendingApproval ?? "—"}
          </StatusBadge>
        </div>

        {/* Avvisade */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuCircleX />
            <span>Avvisade</span>
          </div>

          <StatusBadge status="rejected">
            {counts?.rejected ?? "—"}
          </StatusBadge>
        </div>

        {/* Misslyckade */}
        <div className="payment-status__row">
          <div className="payment-status__label">
            <LuCircleAlert />
            <span>Misslyckade</span>
          </div>

          <StatusBadge status="failed">
            {counts?.failed ?? "—"}
          </StatusBadge>
        </div>

      </div>
    </Card>
  );
}