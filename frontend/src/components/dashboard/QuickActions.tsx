import type { ReactNode } from "react";
import {LuArrowRight,LuList,LuPlus,LuUpload,LuUserRoundPlus } from "react-icons/lu";
import { Link } from "react-router-dom";
import Card from "../shared/Card";

interface QuickAction {
	label: string;
	description: string;
	icon: ReactNode;
	variant: "green" | "blue" | "yellow" | "purple";
	to: string;
}

export default function QuickActions() {
	const actions: QuickAction[] = [
		{
			label: "Ny betalning",
			description: "Skapa en ny betalning",
			icon: <LuPlus />,
			variant: "green",
			to: "/new-payment",
		},
		{
			label: "Ladda upp fil",
			description: "Ladda upp batchfil",
			icon: <LuUpload />,
			variant: "blue",
			to: "/batch-upload",
		},
		{
			label: "Godkänn betalningar",
			description: "Se och godkänn betalningar",
			icon: <LuUserRoundPlus />,
			variant: "yellow",
			to: "/approval-inbox",
		},
		{
			label: "Visa alla betalningar",
			description: "Gå till betalningsöversikten",
			icon: <LuList />,
			variant: "purple",
			to: "/audit-log",
		},
	];

	return (
		<Card className="quick-actions">
			<div className="dashboard-section__header">
				<h2>Snabbåtgärder</h2>

			</div>

			<div className="quick-actions__grid">
				{actions.map((action) => (
					<Link
						className={`quick-actions__item quick-actions__item--${action.variant}`}
						to={action.to}
						key={action.label}
					>
						<span className="quick-actions__icon">
							{action.icon}
						</span>

						<span className="quick-actions__content">
							<span className="quick-actions__label">
								{action.label}
							</span>

							<span className="quick-actions__description">
								{action.description}
							</span>
						</span>

						<LuArrowRight className="quick-actions__arrow" />
					</Link>
				))}
			</div>
		</Card>
	);
}