import { FiCheckCircle, FiClock, FiMinusCircle, FiXCircle } from "react-icons/fi";
import StatusBadge from "../shared/StatusBadge";
import type { ApprovalTimelineStep } from "../../types/Approval";

type ApprovalTimelineProps = {
  timeline?: ApprovalTimelineStep[];
};

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ApprovalTimeline({ timeline }: ApprovalTimelineProps) {
  return (
    <section aria-labelledby="approval-timeline-heading">
      <h3 id="approval-timeline-heading">Attesttidslinje</h3>
      {timeline?.length ? (
        <ol className="approval-timeline" role="list">
          {timeline.map((step) => {
            const isCancelled = step.decisionSource === "payment_rejected";
            const isPending = step.status === "pending";
            const isApproved = step.status === "approved";
            const statusText = isCancelled ? "Avbruten" : isPending ? "Väntar på godkännande" : isApproved ? "Godkänd" : "Avvisad";
            const Icon = isCancelled ? FiMinusCircle : isPending ? FiClock : isApproved ? FiCheckCircle : FiXCircle;
            const date = step.decidedAt ? new Date(step.decidedAt) : null;

            return (
              <li key={step.approvalStepId} className={`approval-timeline-step approval-timeline-step--${isCancelled ? "cancelled" : step.status}`}>
                <span className="approval-timeline-marker" aria-hidden="true"><Icon /></span>
                <div className="approval-timeline-content">
                  <div className="approval-timeline-step-header">
                    <span className="approval-timeline-step-number">Atteststeg {step.stepNumber}</span>
                    <StatusBadge status={isCancelled ? "processing" : isPending ? "pending" : isApproved ? "success" : "rejected"}>{statusText}</StatusBadge>
                  </div>
                  <p className="approval-timeline-assignee">Tilldelad: <strong>{step.attestantName ?? "Inte tilldelad"}</strong></p>
                  {isCancelled ? (
                    <p>Avbruten eftersom betalningen avvisades.</p>
                  ) : !isPending ? (
                    <p className="approval-timeline-decision">
                      {step.decidedByName
                        ? <>{isApproved ? "Godkänd" : "Avvisad"} av <strong>{step.decidedByName}</strong>.</>
                        : "Uppgift om beslutsfattare saknas."}
                    </p>
                  ) : null}
                  {!isPending && (
                    <p className="approval-timeline-time">
                      {date && !Number.isNaN(date.getTime())
                        ? <time dateTime={step.decidedAt!}>{dateTimeFormatter.format(date)}</time>
                        : "Tidpunkt saknas."}
                    </p>
                  )}
                  {step.comment && <p className="approval-timeline-comment">Kommentar: {step.comment}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="approval-details-missing">Uppgifter om tidslinjen saknas. Uppdatera listan för att försöka igen.</p>
      )}
    </section>
  );
}
