import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';
import { useScrollLock } from '../../hooks/useScrollLock';
import { cn } from '../../utils/cn';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  );
}

let openDialogs = 0;

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Element to focus when the dialog opens. Defaults to the first field in the body. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** When false, Escape, the overlay and the close button do nothing (e.g. while saving). */
  dismissible?: boolean;
  className?: string;
}

/** A modal dialog rendered in a portal, with focus trap, Escape/overlay close and scroll lock. */
export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return createPortal(<DialogContent {...props} />, document.body);
}

function DialogContent({
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocusRef,
  dismissible = true,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useScrollLock(true);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById('root');

    openDialogs += 1;
    // Everything behind the dialog becomes unreachable for keyboard and screen readers.
    appRoot?.setAttribute('inert', '');

    const target = initialFocusRef?.current ?? focusableElements(bodyRef.current)[0] ?? panelRef.current;
    target?.focus();

    return () => {
      openDialogs -= 1;
      if (openDialogs === 0) appRoot?.removeAttribute('inert');
      // The trigger may be gone (e.g. an approved item left the list); fall back to the page.
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else document.getElementById('main-content')?.focus({ preventScroll: true });
    };
  }, [initialFocusRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (dismissible) onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const elements = focusableElements(panelRef.current);
    if (elements.length === 0) {
      event.preventDefault();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return;
        // Keep focus inside the dialog when the overlay is clicked.
        event.preventDefault();
        if (dismissible) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cn('dialog', `dialog--${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="dialog__header">
          <div className="dialog__heading">
            <h2 className="dialog__title" id={titleId}>
              {title}
            </h2>
            {description && (
              <p className="dialog__description" id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          <button type="button" className="dialog__close" onClick={onClose} disabled={!dismissible} aria-label="Stäng">
            <LuX aria-hidden="true" />
          </button>
        </div>
        {children && (
          <div className="dialog__body" ref={bodyRef}>
            {children}
          </div>
        )}
        {footer && <div className="dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}
