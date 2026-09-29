import { useEffect, useId, useRef, useState } from 'react';
import { LuSearch, LuX } from 'react-icons/lu';
import { cn } from '../../utils/cn';

interface SearchFieldProps {
  /** The committed value, e.g. from the URL. */
  value: string | undefined;
  /** Called with the trimmed text (undefined when empty) after typing pauses. */
  onChange: (value: string | undefined) => void;
  label: string;
  placeholder?: string;
  delay?: number;
  hideLabel?: boolean;
  className?: string;
}

/**
 * A search input that reports changes debounced. It keeps its own draft while the user
 * types and follows `value` when it changes from elsewhere (e.g. the global search).
 */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  delay = 300,
  hideLabel = true,
  className,
}: SearchFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? '');
  const [committed, setCommitted] = useState(value);
  const [focused, setFocused] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Follow outside changes, but never overwrite what the user is typing right now.
  if (value !== committed) {
    setCommitted(value);
    if (!focused) setDraft(value ?? '');
  }

  function commit(next: string) {
    window.clearTimeout(timer.current);
    onChangeRef.current(next.trim() || undefined);
  }

  function schedule(next: string) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChangeRef.current(next.trim() || undefined), delay);
  }

  return (
    <div className={cn('search-field', className)}>
      <label htmlFor={id} className={cn('field__label', hideLabel && 'visually-hidden')}>
        {label}
      </label>
      <div className="input input--has-prefix input--has-suffix">
        <span className="input__adornment input__adornment--start">
          <LuSearch aria-hidden="true" />
        </span>
        <input
          id={id}
          type="search"
          className="input__control"
          value={draft}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(event) => {
            setDraft(event.target.value);
            schedule(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(draft);
            }
            if (event.key === 'Escape' && draft) {
              event.preventDefault();
              setDraft('');
              commit('');
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <span className="input__adornment input__adornment--end">
          {draft && (
            <button
              type="button"
              className="input__toggle"
              onClick={() => {
                setDraft('');
                commit('');
              }}
              aria-label="Rensa sökningen"
              title="Rensa sökningen"
            >
              <LuX aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
