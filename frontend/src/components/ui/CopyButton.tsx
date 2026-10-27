import { useEffect, useState, type MouseEvent } from 'react';
import { LuCheck, LuCopy } from 'react-icons/lu';
import { cn } from '../../utils/cn';
import { copyText } from '../../utils/clipboard';
import { useToast } from './toast/ToastContext';

interface CopyButtonProps {
  value: string;
  /** Accessible name, e.g. "Kopiera IBAN". */
  label: string;
  successMessage?: string;
  className?: string;
}

export function CopyButton({ value, label, successMessage = 'Kopierat.', className }: CopyButtonProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // The button often sits inside a clickable row or card.
    event.preventDefault();
    event.stopPropagation();
    if (await copyText(value)) {
      setCopied(true);
      toast.success(successMessage);
    } else {
      toast.error('Det gick inte att kopiera. Markera texten och kopiera den manuellt.');
    }
  }

  return (
    <button
      type="button"
      className={cn('copy-button', copied && 'is-copied', className)}
      onClick={handleClick}
      aria-label={label}
      title={label}
    >
      {copied ? <LuCheck aria-hidden="true" /> : <LuCopy aria-hidden="true" />}
    </button>
  );
}
