import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Unique prefix for the tab and panel ids. */
  idPrefix: string;
  className?: string;
}

const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/** WAI-ARIA tabs with automatic activation (arrow keys, Home and End move between tabs). */
export function Tabs<T extends string>({ items, value, onChange, label, idPrefix, className }: TabsProps<T>) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === value);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % items.length;
        break;
      case 'ArrowLeft':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = items[next];
    onChange(target.id);
    document.getElementById(tabId(idPrefix, target.id))?.focus();
  }

  return (
    <div className={cn('tabs', className)} role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={tabId(idPrefix, item.id)}
            aria-selected={selected}
            aria-controls={selected ? panelId(idPrefix, item.id) : undefined}
            tabIndex={selected ? 0 : -1}
            className={cn('tabs__tab', selected && 'is-selected')}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count !== undefined && <span className="tabs__count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  idPrefix: string;
  tab: string;
  className?: string;
  children: ReactNode;
}

export function TabPanel({ idPrefix, tab, className, children }: TabPanelProps) {
  return (
    <div role="tabpanel" id={panelId(idPrefix, tab)} aria-labelledby={tabId(idPrefix, tab)} className={className}>
      {children}
    </div>
  );
}
