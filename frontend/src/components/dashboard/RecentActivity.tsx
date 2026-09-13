import { useEffect, useState } from "react";
import {LuArrowRight, LuCircleCheck, LuFilePlus, LuShieldCheck } from "react-icons/lu";
import Card from "../shared/Card";

interface AuditEntry {
	id: number;
	userId: number;
	action: string;
	entityType: string;
	entityId: number;
	description: string;
	createdAt: string;
}

export default function RecentActivity() {
	const [activities, setActivities] = useState<AuditEntry[]>([]);

	useEffect(() => {
		fetch("http://localhost:3001/auditEntries")
			.then((response) => response.json())
			.then((data: AuditEntry[]) => {
				setActivities(data.slice(-3).reverse());
			})
			.catch((error) => {
				console.error(
					"Kunde inte hämta senaste aktivitet:",
					error
				);
			});
	}, []);

	const formatTime = (date: string) => {
		return new Intl.DateTimeFormat("sv-SE", {
			hour: "2-digit",
			minute: "2-digit",
		}).format(new Date(date));
	};

	const getActivityIcon = (action: string) => {
		switch (action) {
			case "CREATE_PAYMENT":
				return <LuFilePlus />;

			case "VALIDATE_IBAN":
				return <LuShieldCheck />;

			default:
				return <LuCircleCheck />;
		}
	};

	return (
		<Card className="recent-activity">
			<div className="dashboard-section__header">
				<h2>Senaste aktivitet</h2>

				<button className="dashboard-section__link">
					Visa alla
					<LuArrowRight />
				</button>
			</div>

			<div className="recent-activity__list">
				{activities.length === 0 ? (
					<div className="recent-activity__empty">
						Ingen aktivitet ännu
					</div>
				) : (
					activities.map((activity) => (
						<div
							className="recent-activity__item"
							key={activity.id}
						>
							<div className="recent-activity__icon">
								{getActivityIcon(activity.action)}
							</div>

							<div className="recent-activity__info">
								<strong>
									{activity.description}
								</strong>

								<span>
									{formatTime(activity.createdAt)}
								</span>
							</div>
						</div>
					))
				)}
			</div>
		</Card>
	);
}