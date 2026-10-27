import { useCallback, useRef } from 'react';
import { createUuid } from '../utils/uuid';

/**
 * One Idempotency-Key per submission. Retrying the same submission (same fingerprint,
 * e.g. after a network error) reuses the key, so the backend never creates a duplicate
 * payment; any change to the submission gets a fresh key.
 */
export function useIdempotencyKey() {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);

  const keyFor = useCallback((fingerprint: string) => {
    if (current.current?.fingerprint !== fingerprint) {
      current.current = { fingerprint, key: createUuid() };
    }
    return current.current.key;
  }, []);

  const reset = useCallback(() => {
    current.current = null;
  }, []);

  return { keyFor, reset };
}
