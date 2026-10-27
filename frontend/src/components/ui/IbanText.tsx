import { cn } from '../../utils/cn';
import { formatIban, normalizeIban } from '../../utils/iban';
import { CopyButton } from './CopyButton';

interface IbanTextProps {
  iban: string | null | undefined;
  /** Adds a copy-to-clipboard button. */
  copyable?: boolean;
  className?: string;
}

/** An IBAN grouped in fours: "SE35 5000 0000 0549 1000 0003". */
export function IbanText({ iban, copyable = false, className }: IbanTextProps) {
  if (!iban) return <span className="text-muted">–</span>;
  return (
    <span className={cn('iban', className)}>
      <span className="iban__value">{formatIban(iban)}</span>
      {copyable && <CopyButton value={normalizeIban(iban)} label="Kopiera IBAN" successMessage="IBAN har kopierats." />}
    </span>
  );
}
