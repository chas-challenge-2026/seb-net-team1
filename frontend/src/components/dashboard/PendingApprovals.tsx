import { useState } from "react";
import {
	LuChevronDown,
	LuChevronUp,
	LuCircleCheck,
	LuClock3,
} from "react-icons/lu";
import type { DashboardPayment } from "../../api/dashboardApi";
import Card from "../shared/Card";
import StatusBadge from "../shared/StatusBadge";

interface PendingApprovalsProps {
	approvals: DashboardPayment[] | null;
	searchActive?: boolean;
}

export default function PendingApprovals({
	approvals,
	searchActive = false,
}: PendingApprovalsProps) {
	const [showAll, setShowAll] = useState(false);
	const formatAmount = (amount: number, currency: string) =>
		`${new Intl.NumberFormat("sv-SE", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(amount)} ${currency}`;

	return (
		<Card className="pending-approvals">
			<div className="dashboard-section__header">
				<h2>Väntar på godkännande</h2>
				{approvals !== null && approvals.length > 3 && (
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

			<div className="pending-approvals__list">
				{approvals === null ? (
					<div className="pending-approvals__empty">Hämtar godkännanden...</div>
				) : approvals.length === 0 ? (
					<div className="pending-approvals__empty">
						{searchActive ? (
							<span>Inga godkännanden matchar sökningen</span>
						) : (
							<>
								<LuCircleCheck />
								<span>Inga betalningar väntar på godkännande</span>
							</>
						)}
					</div>
				) : (
					(showAll ? approvals : approvals.slice(0, 3)).map((payment) => (
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