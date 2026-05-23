'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiOptions {
  pollInterval?: number;
  deps?: any[];
  enabled?: boolean;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  options: UseApiOptions = {}
): UseApiResult<T> {
  const { pollInterval, deps = [], enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading((prev) => (data === null ? true : prev));
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [enabled, ...deps]);

  useEffect(() => {
    refetch();

    if (pollInterval && pollInterval > 0) {
      const interval = setInterval(refetch, pollInterval);
      return () => clearInterval(interval);
    }
  }, [refetch, pollInterval]);

  return { data, loading, error, refetch };
}
