import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/client';

/** Pipeline and list views query the server before paging, rather than filtering the workspace preload. */
export function useCrmLeadPage<T>(filters: Record<string, string>, fallback: T[], enabled: boolean, limit = 50) {
  const [search, setSearch] = useState(filters.search ?? '');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(filters.search?.trim() ?? ''), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);
  const params = new URLSearchParams({ ...filters, search });
  for (const [key, value] of [...params]) if (!value || value === 'ALL') params.delete(key);
  const filterKey = params.toString();
  const [selection, setSelection] = useState({ key: '', page: 1 });
  const page = selection.key === filterKey ? selection.page : 1;
  const setPage = (next: number) => setSelection({ key: filterKey, page: next });
  useEffect(() => { setSelection(current => current.key === filterKey ? current : { key: filterKey, page: 1 }); }, [filterKey]);
  const [result, setResult] = useState<{ items: T[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const request = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/crm/leads?${filterKey}${filterKey ? '&' : ''}page=${page}&limit=${limit}`);
      const json = await res.json();
      if (request !== version.current) return;
      if (!res.ok || !json.success || !Array.isArray(json.data?.leads)) throw new Error(typeof json.message === 'string' ? json.message : 'Could not load leads. Try again.');
      const total = json.data.pagination?.total ?? json.data.leads.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      setResult({ items: json.data.leads, total, totalPages });
      if (page > totalPages) setSelection({ key: filterKey, page: totalPages });
    } catch (error) {
      if (request === version.current) setError(error instanceof Error ? error.message : 'Could not load leads. Try again.');
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, [enabled, filterKey, page, limit]);
  useEffect(() => {
    void reload();
    return () => { version.current++; };
  }, [reload, fallback]);
  return { leads: enabled ? result?.items ?? fallback : fallback, total: result?.total ?? fallback.length,
    totalPages: result?.totalPages ?? 1, loading, error, page, setPage, reload };
}
