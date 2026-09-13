import { useEffect, useState } from "react";
import { LuArrowRight, LuCircleCheck, LuClock3 } from "react-icons/lu";
import Card from "../shared/Card";
import StatusBadge from "../shared/StatusBadge";

interface ApprovalStep {
	id: number;
	paymentId: number;
	attestantId: number;
	stepNumber: number;
	status: string;
}

interface Payment {
	id: number;
	amount: number;
	currency: string;
	reference: string;
	status: string;
}

interface User {
	id: number;
	name: string;
}

interface PendingApproval {
	payment: Payment;
	step: ApprovalStep;
	approver: User | undefined;
}

export default function PendingApprovals() {
	const [approvals, setApprovals] = useState<PendingApproval[]>([]);

	useEffect(() => {
		const fetchApprovals = async () => {
			try {
				const [approvalResponse, paymentResponse, userResponse] =
					await Promise.all([
						fetch("http://localhost:3001/approvalSteps"),
						fetch("http://localhost:3001/payments"),
						fetch("http://localhost:3001/users"),
					]);

				const approvalSteps: ApprovalStep[] =
					await approvalResponse.json();

				const payments: Payment[] = await paymentResponse.json();

				const users: User[] = await userResponse.json();

				const pendingApprovals = approvalSteps
					.filter((step) => step.status === "pending")
					.map((step) => {
						const payment = payments.find(
							(payment) => payment.id === step.paymentId
						);

						const approver = users.find(
							(user) => user.id === step.attestantId
						);

						return {
							payment,
							step,
							approver,
						};
					})
					.filter(
						(
							approval
						): approval is PendingApproval =>
							approval.payment !== undefined
					)
					.slice(0, 3);

				setApprovals(pendingApprovals);
			} catch (error) {
				console.error(
					"Kunde inte hämta väntande godkännanden:",
					error
				);
			}
		};

		fetchApprovals();
	}, []);

	const formatAmount = (amount: number, currency: string) => {
		return `${new Intl.NumberFormat("sv-SE").format(
			amount
		)} ${currency}`;
	};

	return (
		<Card className="pending-approvals">
			<div className="dashboard-section__header">
				<h2>Väntar på godkännande</h2>

				<button className="dashboard-section__link">
					Visa alla
					<LuArrowRight />
				</button>
			</div>

			<div className="pending-approvals__list">
				{approvals.length === 0 ? (
					<div className="pending-approvals__empty">
						<LuCircleCheck />
						<span>Inga betalningar väntar på godkännande</span>
					</div>
				) : (
					approvals.map(({ payment, step, approver }) => (
						<div
							className="pending-approvals__item"
							key={step.id}
						>
							<div className="pending-approvals__icon">
								<LuClock3 />
							</div>

							<div className="pending-approvals__info">
								<strong>{payment.reference}</strong>

								<span>
									{approver
										? approver.name
										: "Godkännare"}
								</span>
							</div>

							<div className="pending-approvals__details">
								<strong>
									{formatAmount(
										payment.amount,
										payment.currency
									)}
								</strong>

								<StatusBadge status="pending">
									Steg {step.stepNumber}
								</StatusBadge>
							</div>
						</div>
					))
				)}
			</div>
		</Card>
	);
}