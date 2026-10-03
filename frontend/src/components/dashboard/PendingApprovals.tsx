import { LuArrowRight, LuCircleCheck, LuClock3 } from "react-icons/lu";
import { Link } from "react-router-dom";
import type { DashboardPayment } from "../../api/dashboardApi";
import Card from "../shared/Card";
import StatusBadge from "../shared/StatusBadge";

interface PendingApprovalsProps {
	approvals: DashboardPayment[] | null;
}

export default function PendingApprovals({ approvals }: PendingApprovalsProps) {
	const formatAmount = (amount: number, currency: string) =>
		`${new Intl.NumberFormat("sv-SE").format(amount)} ${currency}`;

	return (
		<Card className="pending-approvals">
			<div className="dashboard-section__header">
				<h2>Väntar på godkännande</h2>
				<Link to="/approval-inbox" className="dashboard-section__link">
					Visa alla
					<LuArrowRight />
				</Link>
			</div>

			<div className="pending-approvals__list">
				{approvals === null ? (
					<div className="pending-approvals__empty">Hämtar godkännanden...</div>
				) : approvals.length === 0 ? (
					<div className="pending-approvals__empty">
						<LuCircleCheck />
						<span>Inga betalningar väntar på godkännande</span>
					</div>
				) : (
					approvals.slice(0, 3).map((payment) => (
						<div className="pending-approvals__item" key={payment.id}>
							<div className="pending-approvals__icon">
								<LuClock3 />
							</div>
							<div className="pending-approvals__info">
								<strong>{payment.reference}</strong>
								<span>
									{payment.toIban ? `•••• ${payment.toIban.slice(-4)}` : "IBAN saknas"}
								</span>
							</div>
							<div className="pending-approvals__details">
								<strong>{formatAmount(payment.amount, payment.currency)}</strong>
								<StatusBadge status="pending">Godkännande</StatusBadge>
							</div>
						</div>
					))
				)}
			</div>
		</Card>
	);
}