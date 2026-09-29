import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

interface PopoverProps {
  /** Accessible name of the trigger button. */
  label: string;
  triggerContent: ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  /** 'menu' gets menu semantics and arrow-key navigation between role="menuitem" children. */
  kind?: 'menu' | 'dialog';
  align?: 'start' | 'end';
  /** Receives a function that closes the panel. */
  children: (close: () => void) => ReactNode;
}

/** A button that opens a floating panel. Closes on outside click and Escape. */
export function Popover({
  label,
  triggerContent,
  triggerClassName,
  panelClassName,
  kind = 'dialog',
  align = 'end',
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  // Menus move focus to their first item so they can be used from the keyboard.
  useEffect(() => {
    if (open && kind === 'menu') {
      panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [open, kind]);

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (kind !== 'menu') return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (event.key === 'Tab') setOpen(false);
    if (next !== null) {
      event.preventDefault();
      items[next].focus();
    }
  }

  return (
    <div className="popover" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup={kind === 'menu' ? 'menu' : 'dialog'}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        {triggerContent}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className={cn('popover__panel', `popover__panel--${align}`, panelClassName)}
          role={kind}
          aria-label={label}
          onKeyDown={handlePanelKeyDown}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
