import type { ReactNode } from 'react';
import { LuCheck, LuClock, LuFilePlus, LuX } from 'react-icons/lu';
import type { PaymentDetail } from '../../api/types';
import { cn } from '../../utils/cn';
import { formatDateTime } from '../../utils/date';

type TimelineState = 'done' | 'current' | 'upcoming' | 'rejected';

interface TimelineItem {
  key: string;
  state: TimelineState;
  title: string;
  meta?: ReactNode;
  detail?: ReactNode;
  comment?: string | null;
  /** The current user is the one who should act. */
  yourTurn?: boolean;
}

const STATE_LABELS: Record<TimelineState, string> = {
  done: 'Klart',
  current: 'Pågår',
  upcoming: 'Kommande',
  rejected: 'Avvisat',
};

function buildTimeline(payment: PaymentDetail): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      key: 'created',
      state: 'done',
      title: 'Betalningen skapades',
      meta: `${payment.createdByName} · ${formatDateTime(payment.createdAt)}`,
      detail: payment.source === 'batch' ? 'Skapad från en batchfil.' : undefined,
    },
  ];

  const steps = [...payment.approvalSteps].sort((a, b) => a.stepNumber - b.stepNumber);
  // Later steps may only be created once the previous one is approved, so fill in
  // the steps the payment still needs.
  const requiredSteps = Math.max(
    steps.length,
    payment.approvalProgress?.required ?? 0,
    payment.requiresDoubleApproval ? 2 : payment.requiresApproval ? 1 : 0,
  );

  let currentShown = false;
  for (let stepNumber = 1; stepNumber <= requiredSteps; stepNumber += 1) {
    const step = steps.find((candidate) => candidate.stepNumber === stepNumber);
    const title = requiredSteps > 1 ? `Attest ${stepNumber} av ${requiredSteps}` : 'Attest';
    const key = `step-${stepNumber}`;

    if (step?.status === 'approved') {
      items.push({
        key,
        state: 'done',
        title: `${title}: godkänd`,
        meta: `${step.attestantName ?? 'Attestant'} · ${formatDateTime(step.decidedAt)}`,
        comment: step.comment,
      });
    } else if (step?.status === 'rejected') {
      items.push({
        key,
        state: 'rejected',
        title: `${title}: avvisad`,
        meta: `${step.attestantName ?? 'Attestant'} · ${formatDateTime(step.decidedAt)}`,
        comment: step.comment,
      });
    } else if (payment.status === 'pending_approval' && !currentShown) {
      currentShown = true;
      const yourTurn = step !== undefined && step.id === payment.myApprovalStepId;
      items.push({
        key,
        state: 'current',
        title: `${title}: väntar`,
        meta: yourTurn
          ? 'Väntar på din attest'
          : step?.attestantName
            ? `Väntar på ${step.attestantName}`
            : 'Väntar på en attestant',
        yourTurn,
      });
    } else {
      items.push({
        key,
        state: 'upcoming',
        title,
        meta: payment.status === 'rejected' ? 'Behövs inte längre' : 'Efter föregående attest',
      });
    }
  }

  if (payment.status === 'completed') {
    items.push({
      key: 'completed',
      state: 'done',
      title: 'Genomförd',
      meta: formatDateTime(payment.executedAt),
      detail: payment.requiresApproval
        ? 'Beloppet har dragits från kontot.'
        : 'Genomfördes direkt eftersom beloppet understeg attestgränsen.',
    });
  } else if (payment.status === 'rejected') {
    items.push({
      key: 'rejected',
      state: 'rejected',
      title: 'Avvisad',
      detail: 'Betalningen genomfördes inte och det reserverade beloppet frigjordes.',
    });
  } else {
    items.push({
      key: 'execution',
      state: 'upcoming',
      title: 'Genomförs',
      meta: 'När alla attester är klara',
    });
  }

  return items;
}

function StateIcon({ state, first }: { state: TimelineState; first: boolean }) {
  if (state === 'rejected') return <LuX aria-hidden="true" />;
  if (state === 'current') return <LuClock aria-hidden="true" />;
  if (state === 'done') return first ? <LuFilePlus aria-hidden="true" /> : <LuCheck aria-hidden="true" />;
  return <span className="timeline__dot" aria-hidden="true" />;
}

/** Created → attest step(s) → completed or rejected, with who decided what and when. */
export function ApprovalTimeline({ payment }: { payment: PaymentDetail }) {
  const items = buildTimeline(payment);
  return (
    <ol className="timeline">
      {items.map((item, index) => (
        <li key={item.key} className={cn('timeline__item', `timeline__item--${item.state}`)}>
          <span className="timeline__marker">
            <StateIcon state={item.state} first={index === 0} />
          </span>
          <div className="timeline__content">
            <p className="timeline__title">
              {item.title}
              <span className="visually-hidden"> ({STATE_LABELS[item.state]})</span>
            </p>
            {item.meta && (
              <p className={cn('timeline__meta', item.yourTurn && 'timeline__meta--highlight')}>{item.meta}</p>
            )}
            {item.detail && <p className="timeline__detail">{item.detail}</p>}
            {item.comment && (
              <blockquote className="timeline__comment">
                <span className="visually-hidden">Kommentar: </span>
                {item.comment}
              </blockquote>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
