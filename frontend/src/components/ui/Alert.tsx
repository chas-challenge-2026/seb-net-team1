import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { LuCircleAlert, LuCircleCheck, LuInfo, LuTriangleAlert, LuX } from 'react-icons/lu';
import { cn } from '../../utils/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ICONS: Record<AlertTone, IconType> = {
  info: LuInfo,
  success: LuCircleCheck,
  warning: LuTriangleAlert,
  danger: LuCircleAlert,
};

interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: IconType;
  actions?: ReactNode;
  onDismiss?: () => void;
  /** Announce the alert to screen readers when it appears. Defaults to true for danger. */
  live?: boolean;
  className?: string;
}

export function Alert({ tone = 'info', title, children, icon, actions, onDismiss, live, className }: AlertProps) {
  const Icon = icon ?? ICONS[tone];
  const announce = live ?? tone === 'danger';
  return (
    <div className={cn('alert', `alert--${tone}`, className)} role={announce ? 'alert' : undefined}>
      <Icon className="alert__icon" aria-hidden="true" />
      <div className="alert__body">
        {title && <p className="alert__title">{title}</p>}
        {children && <div className="alert__content">{children}</div>}
        {actions && <div className="alert__actions">{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="alert__close" onClick={onDismiss} aria-label="Stäng">
          <LuX aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
