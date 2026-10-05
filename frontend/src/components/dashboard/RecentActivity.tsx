import {LuCircleCheck, LuFilePlus, LuShieldCheck } from "react-icons/lu";
import Card from "../shared/Card";
import type { DashboardAuditEntry } from "../../api/dashboardApi";

interface RecentActivityProps {
	activities: DashboardAuditEntry[] | null;
}

export default function RecentActivity({ activities }: RecentActivityProps) {

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

			</div>

			<div className="recent-activity__list">
				{activities === null ? (
					<div className="recent-activity__empty">Hämtar aktivitet...</div>
				) : activities.length === 0 ? (
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