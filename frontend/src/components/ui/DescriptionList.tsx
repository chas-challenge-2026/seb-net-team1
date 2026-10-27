import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface DescriptionItem {
  label: string;
  value: ReactNode;
  /** Spans the full width of the grid. */
  wide?: boolean;
}

interface DescriptionListProps {
  items: DescriptionItem[];
  columns?: 1 | 2 | 3;
  className?: string;
}

export function DescriptionList({ items, columns = 2, className }: DescriptionListProps) {
  return (
    <dl className={cn('description-list', `description-list--cols-${columns}`, className)}>
      {items.map((item) => (
        <div key={item.label} className={cn('description-list__item', item.wide && 'is-wide')}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
