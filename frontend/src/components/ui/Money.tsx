import type { Money as MoneyValue } from '../../api/types';
import { cn } from '../../utils/cn';
import { formatMoney, moneyToCents } from '../../utils/money';

interface MoneyProps {
  amount: MoneyValue | number | null | undefined;
  currency?: string;
  /** Show an explicit + for positive amounts. */
  signed?: boolean;
  /** Green for incoming, red for outgoing money. */
  colored?: boolean;
  className?: string;
}

/** An amount in Swedish format: "1 234 567,50 kr". */
export function Money({ amount, currency = 'SEK', signed = false, colored = false, className }: MoneyProps) {
  const cents = typeof amount === 'number' ? Math.round(amount * 100) : moneyToCents(amount);
  const direction = cents > 0 ? 'positive' : cents < 0 ? 'negative' : null;
  return (
    <span className={cn('money', colored && direction && `money--${direction}`, className)}>
      {formatMoney(amount, currency, { signed })}
    </span>
  );
}
