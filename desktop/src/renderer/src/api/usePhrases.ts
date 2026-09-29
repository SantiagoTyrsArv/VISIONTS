import { useQuery } from '@tanstack/react-query';

import { phrasesApi } from './endpoints';

export const PHRASES_KEY = ['phrases'] as const;

export function usePhrases() {
  return useQuery({ queryKey: PHRASES_KEY, queryFn: phrasesApi.list });
}
