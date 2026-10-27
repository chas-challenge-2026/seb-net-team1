import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuCircleAlert, LuCircleCheck, LuInfo, LuX } from 'react-icons/lu';
import { cn } from '../../../utils/cn';
import { ToastContext, type ToastApi, type ToastOptions, type ToastTone } from './ToastContext';

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  title?: string;
  duration: number;
}

const MAX_VISIBLE = 4;
const ICONS = { success: LuCircleCheck, error: LuCircleAlert, info: LuInfo } as const;

let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((tone: ToastTone, message: string, options: ToastOptions = {}) => {
    const toast: ToastItem = {
      id: nextToastId++,
      tone,
      message,
      title: options.title,
      duration: options.duration ?? (tone === 'error' ? 6000 : 4000),
    };
    setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), toast]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, options) => show('success', message, options),
      error: (message, options) => show('error', message, options),
      info: (message, options) => show('info', message, options),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toast-viewport" aria-live="polite" aria-relevant="additions text">
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const Icon = ICONS[toast.tone];

  useEffect(() => {
    if (paused) return;
    const timeout = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timeout);
  }, [paused, toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={cn('toast', `toast--${toast.tone}`)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className="toast__icon" aria-hidden="true" />
      <div className="toast__content">
        {toast.title && <p className="toast__title">{toast.title}</p>}
        <p className="toast__message">{toast.message}</p>
      </div>
      <button type="button" className="toast__close" onClick={() => onDismiss(toast.id)} aria-label="Stäng meddelandet">
        <LuX aria-hidden="true" />
      </button>
    </div>
  );
}
