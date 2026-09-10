import type { ReactNode } from "react";
import {LuArrowRight,LuList,LuPlus,LuUpload,LuUserRoundPlus } from "react-icons/lu";
import Card from "../shared/Card";

interface QuickAction {
	label: string;
	description: string;
	icon: ReactNode;
	variant: "green" | "blue" | "yellow" | "purple";
}

export default function QuickActions() {
	const actions: QuickAction[] = [
		{
			label: "Ny betalning",
			description: "Skapa en ny betalning",
			icon: <LuPlus />,
			variant: "green",
		},
		{
			label: "Ladda upp fil",
			description: "Ladda upp batchfil",
			icon: <LuUpload />,
			variant: "blue",
		},
		{
			label: "Godkänn betalningar",
			description: "Se och godkänn betalningar",
			icon: <LuUserRoundPlus />,
			variant: "yellow",
		},
		{
			label: "Visa alla betalningar",
			description: "Gå till betalningsöversikten",
			icon: <LuList />,
			variant: "purple",
		},
	];

	return (
		<Card className="quick-actions">
			<div className="dashboard-section__header">
				<h2>Snabbåtgärder</h2>

				<button
					className="dashboard-section__link"
					type="button"
				>
					Visa alla
					<LuArrowRight />
				</button>
			</div>

			<div className="quick-actions__grid">
				{actions.map((action) => (
					<button
						className={`quick-actions__item quick-actions__item--${action.variant}`}
						key={action.label}
						type="button"
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
					</button>
				))}
			</div>
		</Card>
	);
}