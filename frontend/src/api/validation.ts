import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { IbanValidation } from './types';

export function fetchIbanValidation(value: string, signal?: AbortSignal) {
  return api.get<IbanValidation>('/api/validation/iban', { query: { value }, signal });
}

/**
 * The server's verdict on an IBAN. The form checks MOD97 locally for instant feedback;
 * this confirms it against the backend rules once the local check passes.
 */
export function useIbanValidation(normalizedIban: string | null) {
  return useQuery({
    queryKey: queryKeys.validation.iban(normalizedIban ?? ''),
    queryFn: ({ signal }) => fetchIbanValidation(normalizedIban ?? '', signal),
    enabled: normalizedIban !== null,
    staleTime: Infinity,
    retry: false,
  });
}
