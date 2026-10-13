import { FiCheckCircle, FiClock, FiFileText, FiMinusCircle, FiXCircle } from "react-icons/fi";
import StatusBadge from "../shared/StatusBadge";
import type { ApprovalTimelineStep } from "../../types/Approval";

type ApprovalTimelineProps = {
  timeline?: ApprovalTimelineStep[];
  creation?: {
    createdByName: string | null;
    createdAt: string;
  };
  heading?: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Stockholm",
});

export default function ApprovalTimeline({ timeline, creation, heading = "Attesttidslinje" }: ApprovalTimelineProps) {
  const creatorName = typeof creation?.createdByName === "string" ? creation.createdByName.trim() : null;
  const createdAt = creation ? new Date(creation.createdAt) : null;

  return (
    <section aria-labelledby="approval-timeline-heading">
      <h3 id="approval-timeline-heading">{heading}</h3>
      {(creation || !!timeline?.length) && (
        <ol className="approval-timeline" role="list">
          {creation && (
            <li className="approval-timeline-step approval-timeline-step--created">
              <span className="approval-timeline-marker" aria-hidden="true"><FiFileText /></span>
              <div className="approval-timeline-content">
                <div className="approval-timeline-step-header">
                  <span className="approval-timeline-step-number">Betalning skapad</span>
                  <StatusBadge status="processing">Skapad</StatusBadge>
                </div>
                <p className="approval-timeline-decision">
                  {creatorName
                    ? <>Skapad av <strong>{creatorName}</strong>.</>
                    : "Uppgift om vem som skapade betalningen saknas."}
                </p>
                <p className="approval-timeline-time">
                  {createdAt && !Number.isNaN(createdAt.getTime())
                    ? <time dateTime={creation.createdAt}>{dateTimeFormatter.format(createdAt)}</time>
                    : "Tidpunkt saknas."}
                </p>
              </div>
            </li>
          )}
          {timeline?.map((step) => {
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
      )}
      {!timeline?.length && (
        <p className="approval-details-missing">Uppgifter om tidslinjen saknas. Uppdatera listan för att försöka igen.</p>
      )}
    </section>
  );
}
