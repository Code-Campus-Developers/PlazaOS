import { keepPreviousData, useQuery } from '@tanstack/react-query'

/**
 * Caches admin list responses briefly so moving between menu pages and back
 * does not refetch the same data immediately.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  initial: T,
  cacheKey: string,
): { data: T; loading: boolean; error: unknown; retry: () => void } {
  const query = useQuery({
    queryKey: ['admin-page', cacheKey, ...deps],
    queryFn: fetcher,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
  })

  return {
    data: query.data ?? initial,
    loading: query.isLoading,
    error: query.error,
    retry: () => void query.refetch(),
  }
}
