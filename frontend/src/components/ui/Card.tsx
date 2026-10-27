import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Id for the heading, so a region can reference it with aria-labelledby. */
  titleId?: string;
  divider?: boolean;
  className?: string;
}

export function CardHeader({ title, description, actions, titleId, divider = false, className }: CardHeaderProps) {
  return (
    <div className={cn('card__header', divider && 'card__header--divider', className)}>
      <div className="card__heading">
        <h2 className="card__title" id={titleId}>
          {title}
        </h2>
        {description && <p className="card__description">{description}</p>}
      </div>
      {actions && <div className="card__actions">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card__body', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card__footer', className)} {...rest}>
      {children}
    </div>
  );
}
