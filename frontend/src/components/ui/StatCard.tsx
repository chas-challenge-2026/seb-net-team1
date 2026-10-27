import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { cn } from '../../utils/cn';
import type { Tone } from '../../utils/labels';
import { Skeleton } from './Skeleton';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: IconType;
  tone?: Tone;
  /** A line of context under the value. */
  meta?: ReactNode;
  /** A link or button at the bottom of the card. */
  action?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, tone = 'brand', meta, action, loading = false, className }: StatCardProps) {
  return (
    <div className={cn('stat-card', className)}>
      <div className="stat-card__head">
        <p className="stat-card__label">{label}</p>
        {Icon && (
          <span className={cn('stat-card__icon', `tone-${tone}`)}>
            <Icon aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="stat-card__value">{loading ? <Skeleton width="60%" height={28} /> : value}</div>
      {(meta || loading) && (
        <div className="stat-card__meta">{loading ? <Skeleton width="45%" height={12} /> : meta}</div>
      )}
      {action && !loading && <div className="stat-card__action">{action}</div>}
    </div>
  );
}
