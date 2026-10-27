import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { cn } from '../../utils/cn';
import type { Tone } from '../../utils/labels';

interface BadgeProps {
  tone?: Tone;
  /** A colored dot before the label. */
  dot?: boolean;
  icon?: IconType;
  size?: 'sm' | 'md';
  title?: string;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot = false, icon: Icon, size = 'md', title, className, children }: BadgeProps) {
  return (
    <span className={cn('badge', `badge--${tone}`, size === 'sm' && 'badge--sm', className)} title={title}>
      {dot && <span className="badge__dot" aria-hidden="true" />}
      {Icon && <Icon aria-hidden="true" className="badge__icon" />}
      {children}
    </span>
  );
}
