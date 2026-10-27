import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right. */
  actions?: ReactNode;
  /** A back link above the title. */
  back?: ReactNode;
  /** Badges or meta information next to the title. */
  titleAside?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, back, titleAside, className }: PageHeaderProps) {
  return (
    <header className={cn('page-header', className)}>
      {back && <div className="page-header__back">{back}</div>}
      <div className="page-header__row">
        <div className="page-header__text">
          <div className="page-header__title-row">
            <h1 className="page-header__title">{title}</h1>
            {titleAside}
          </div>
          {description && <p className="page-header__description">{description}</p>}
        </div>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
    </header>
  );
}
