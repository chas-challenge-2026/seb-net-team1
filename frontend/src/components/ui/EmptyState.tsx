import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { LuInbox } from 'react-icons/lu';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon?: IconType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon: Icon = LuInbox, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cn('empty-state', compact && 'empty-state--compact', className)}>
      <span className="empty-state__icon">
        <Icon aria-hidden="true" />
      </span>
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__description">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
