import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LuSearch } from 'react-icons/lu';

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Searches payments by reference, IBAN or id. Press "/" anywhere to focus it. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = value.trim();
    void navigate({ to: '/payments', search: term ? { search: term } : {} });
    setValue('');
    inputRef.current?.blur();
  }

  return (
    <form role="search" className="global-search" onSubmit={handleSubmit}>
      <label htmlFor="global-search-input" className="visually-hidden">
        Sök betalningar
      </label>
      <LuSearch className="global-search__icon" aria-hidden="true" />
      <input
        ref={inputRef}
        id="global-search-input"
        type="search"
        className="global-search__input"
        placeholder="Sök referens, IBAN eller betalnings-id"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />
      <kbd className="global-search__hint" aria-hidden="true">
        /
      </kbd>
    </form>
  );
}
