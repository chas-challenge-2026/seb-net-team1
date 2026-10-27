import type { IconType } from 'react-icons';
import {
  LuCircleCheck,
  LuCircleX,
  LuFilePlus,
  LuKeyRound,
  LuLogIn,
  LuLogOut,
  LuStamp,
  LuUpload,
  LuUserCog,
  LuUserPlus,
} from 'react-icons/lu';
import type { AuditAction, AuditEntry } from '../../api/types';
import { cn } from '../../utils/cn';
import { formatDateTime, formatRelativeTime } from '../../utils/date';
import { auditActionLabel, auditActionTone } from '../../utils/labels';

const ICONS: Record<AuditAction, IconType> = {
  LOGIN: LuLogIn,
  LOGOUT: LuLogOut,
  CREATE_PAYMENT: LuFilePlus,
  APPROVE_PAYMENT_STEP: LuStamp,
  APPROVE_PAYMENT: LuCircleCheck,
  REJECT_PAYMENT: LuCircleX,
  BATCH_UPLOAD: LuUpload,
  USER_CREATED: LuUserPlus,
  USER_UPDATED: LuUserCog,
  PASSWORD_CHANGED: LuKeyRound,
  PASSWORD_RESET: LuKeyRound,
};

interface ActivityListProps {
  entries: AuditEntry[];
  /** When set, times are shown relative to it ("för 5 min sedan"). */
  now?: number;
  className?: string;
}

/** A compact feed of audit entries. */
export function ActivityList({ entries, now, className }: ActivityListProps) {
  return (
    <ol className={cn('activity-list', className)}>
      {entries.map((entry) => {
        const Icon = ICONS[entry.action] ?? LuFilePlus;
        return (
          <li key={entry.id} className="activity">
            <span className={cn('activity__icon', `tone-${auditActionTone(entry.action)}`)}>
              <Icon aria-hidden="true" />
            </span>
            <div className="activity__body">
              <p className="activity__title">{auditActionLabel(entry.action)}</p>
              <p className="activity__text">{entry.description}</p>
              <p className="activity__meta">
                {entry.userName ?? 'Systemet'} ·{' '}
                <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>
                  {now === undefined ? formatDateTime(entry.createdAt) : formatRelativeTime(entry.createdAt, now)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
