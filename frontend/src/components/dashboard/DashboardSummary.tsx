import {LuWalletCards,LuCircleCheck,LuArrowUpRight,LuTriangleAlert,} from "react-icons/lu";
import { Link } from "react-router-dom";
import type { DashboardData } from "../../api/dashboardApi";
import { canReadAuditLog } from "../../utils/auditAccess";

interface DashboardSummaryProps {
  data: DashboardData | null;
}

export default function DashboardSummary({ data }: DashboardSummaryProps) {
  const summary = data?.summary;

return (
    <section className="dashboard-summary">
      <Link to="/accounts" className="card summary-card" aria-label="Visa konton">
        <div className="summary-card__icon">
			<LuWalletCards />
		</div>

        <span className="summary-card__label">Totalt saldo (SEK)</span>
        <strong className="summary-card__value">
            {summary
              ? `${summary.totalBalance.toLocaleString("sv-SE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} kr`
              : "—"}
        </strong>

        <span className="summary-card__description">
           Saldo på SEK-konton
        </span>
      </Link>

      <Link
        to="/approval-inbox"
        className="card summary-card"
        aria-label="Visa väntande godkännanden"
      >
        <div className="summary-card__icon">
          <LuCircleCheck />
        </div>

        <span className="summary-card__label">
          Väntande godkännanden
        </span>

        <strong className="summary-card__value">
          {summary ? `${summary.pendingApprovals} st` : "—"}
        </strong>

        <span className="summary-card__description">
          Betalningar kräver godkännande
        </span>
      </Link>

      <Link
        to={canReadAuditLog(data?.user.role) ? "/audit-log" : "/payments"}
        className="card summary-card"
        aria-label="Visa betalningar"
      >
        <div className="summary-card__icon">
          <LuArrowUpRight />
        </div>

        <span className="summary-card__label">
          Betalningar
        </span>

        <strong className="summary-card__value">
          {summary?.totalPayments != null ? `${summary.totalPayments} st` : "—"}
        </strong>

        <span className="summary-card__description">
          Totalt registrerade betalningar
        </span>
      </Link>

      <Link to="/reports" className="card summary-card" aria-label="Visa rapporter">
        <div className="summary-card__icon">
          <LuTriangleAlert />
        </div>

        <span className="summary-card__label">
          Valideringsavvikelser
        </span>

        <strong className="summary-card__value">
          {summary?.validationErrors != null ? `${summary.validationErrors} st` : "—"}
        </strong>

        <span className="summary-card__description">
          Fel i IBAN eller BIC
        </span>
      </Link>
    </section>
  );
}
