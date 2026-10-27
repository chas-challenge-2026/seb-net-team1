import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { IconType } from 'react-icons';
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  icon?: IconType;
  iconPosition?: 'start' | 'end';
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon: Icon,
    iconPosition = 'start',
    block = false,
    className,
    disabled,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const iconOnly = !children;
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block, iconOnly, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : Icon && iconPosition === 'start' ? (
        <Icon aria-hidden="true" className="btn__icon" />
      ) : null}
      {children}
      {!loading && Icon && iconPosition === 'end' ? <Icon aria-hidden="true" className="btn__icon" /> : null}
    </button>
  );
});
