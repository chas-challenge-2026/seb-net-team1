import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { LuChevronDown, LuCircleAlert, LuEye, LuEyeOff } from 'react-icons/lu';
import { cn } from '../../utils/cn';

interface FieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  /** Shown to the right of the label, e.g. a character counter. */
  labelAside?: ReactNode;
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}

function messageId(id: string, hint: ReactNode, error: string | undefined) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

function describedBy(...ids: Array<string | undefined>) {
  const value = ids.filter(Boolean).join(' ');
  return value || undefined;
}

/** Label, control, and hint or error message, wired together for assistive technology. */
export function Field({ id, label, hint, error, optional, labelAside, hideLabel, className, children }: FieldProps) {
  return (
    <div className={cn('field', error && 'field--invalid', className)}>
      <div className={cn('field__label-row', hideLabel && 'visually-hidden')}>
        <label className="field__label" htmlFor={id}>
          {label}
          {optional && <span className="field__optional"> (valfritt)</span>}
        </label>
        {labelAside && (
          <span className="field__aside" id={`${id}-aside`}>
            {labelAside}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <p className="field__error" id={`${id}-error`}>
          <LuCircleAlert aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface CommonFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  labelAside?: ReactNode;
  hideLabel?: boolean;
  containerClassName?: string;
}

export interface InputProps extends CommonFieldProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Content inside the field before the text, e.g. an icon. */
  prefix?: ReactNode;
  /** Content inside the field after the text, e.g. a unit or a button. */
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, labelAside, hideLabel, containerClassName, prefix, suffix, id: idProp, className, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      labelAside={labelAside}
      hideLabel={hideLabel}
      className={containerClassName}
    >
      <div
        className={cn(
          'input',
          error && 'input--invalid',
          rest.disabled && 'input--disabled',
          prefix !== undefined && 'input--has-prefix',
          suffix !== undefined && 'input--has-suffix',
        )}
      >
        {prefix !== undefined && <span className="input__adornment input__adornment--start">{prefix}</span>}
        <input
          ref={ref}
          id={id}
          className={cn('input__control', className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(messageId(id, hint, error), labelAside ? `${id}-aside` : undefined)}
          {...rest}
        />
        {suffix !== undefined && <span className="input__adornment input__adornment--end">{suffix}</span>}
      </div>
    </Field>
  );
});

export type PasswordInputProps = Omit<InputProps, 'type' | 'suffix'>;

/** Password field with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      {...props}
      type={visible ? 'text' : 'password'}
      suffix={
        <button
          type="button"
          className="input__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Dölj lösenord' : 'Visa lösenord'}
          title={visible ? 'Dölj lösenord' : 'Visa lösenord'}
          disabled={props.disabled}
        >
          {visible ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
        </button>
      }
    />
  );
});

export interface SelectProps extends CommonFieldProps, SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, optional, labelAside, hideLabel, containerClassName, id: idProp, className, children, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      labelAside={labelAside}
      hideLabel={hideLabel}
      className={containerClassName}
    >
      <div className={cn('select', error && 'select--invalid', rest.disabled && 'select--disabled')}>
        <select
          ref={ref}
          id={id}
          className={cn('select__control', className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(messageId(id, hint, error), labelAside ? `${id}-aside` : undefined)}
          {...rest}
        >
          {children}
        </select>
        <LuChevronDown className="select__icon" aria-hidden="true" />
      </div>
    </Field>
  );
});

export interface TextareaProps extends CommonFieldProps, TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, labelAside, hideLabel, containerClassName, id: idProp, className, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      labelAside={labelAside}
      hideLabel={hideLabel}
      className={containerClassName}
    >
      <textarea
        ref={ref}
        id={id}
        className={cn('textarea', error && 'textarea--invalid', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(messageId(id, hint, error), labelAside ? `${id}-aside` : undefined)}
        {...rest}
      />
    </Field>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className={cn('checkbox', className)}>
      <input
        ref={ref}
        type="checkbox"
        id={id}
        className="checkbox__input"
        aria-describedby={description ? `${id}-description` : undefined}
        {...rest}
      />
      <label htmlFor={id} className="checkbox__label">
        <span>{label}</span>
        {description && (
          <span className="checkbox__description" id={`${id}-description`}>
            {description}
          </span>
        )}
      </label>
    </div>
  );
});

/** An on/off toggle. It is a checkbox with the switch role, so it works with forms and keyboards. */
export const Switch = forwardRef<HTMLInputElement, CheckboxProps>(function Switch(
  { label, description, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className={cn('switch', className)}>
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        id={id}
        className="switch__input"
        aria-describedby={description ? `${id}-description` : undefined}
        {...rest}
      />
      <label htmlFor={id} className="switch__label">
        <span>{label}</span>
        {description && (
          <span className="switch__description" id={`${id}-description`}>
            {description}
          </span>
        )}
      </label>
    </div>
  );
});
