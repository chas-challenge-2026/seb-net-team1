import { cn } from '../../utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-secondary';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  iconOnly?: boolean;
  className?: string;
}

/** Button styles, also used on router links that should look like buttons. */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  block = false,
  iconOnly = false,
  className,
}: ButtonClassOptions = {}): string {
  return cn('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', iconOnly && 'btn--icon', className);
}
