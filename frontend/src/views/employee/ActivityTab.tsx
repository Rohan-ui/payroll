import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { employeeProfileApi, type ActivityEntry } from '../../api/employee-profile.api';
import { errorText } from '../payroll/payroll-format';
import { Section } from './profile-ui';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** The employee's history as recorded in the audit trail, newest first. */
export const ActivityTab: React.FC<{ employeeId: string; refreshKey: number }> = ({ employeeId, refreshKey }) => {
  const [items, setItems] = useState<ActivityEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    let live = true;
    setItems(null);
    setError(null);
    employeeProfileApi.activity(employeeId)
      .then((page) => { if (live) { setItems(page.items); setNext(page.next); } })
      .catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [employeeId, refreshKey]);

  const loadMore = useCallback(async () => {
    if (!next) return;
    setIsLoadingMore(true);
    try {
      const page = await employeeProfileApi.activity(employeeId, next);
      setItems((current) => [...(current ?? []), ...page.items]);
      setNext(page.next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setIsLoadingMore(false);
    }
  }, [employeeId, next]);

  return (
    <Section title="Activity" description="Changes to this employee’s record, who made them and when.">
      {error && <p role="alert" className="mb-3 text-sm text-red-700">Activity could not be loaded: {error}</p>}
      {items === null && !error ? <p className="text-sm text-slate-500">Loading activity…</p>
        : items && items.length === 0 ? <p className="text-sm text-slate-500">Nothing recorded yet. Changes made from this page will appear here.</p>
        : items && (
          <>
            <ol className="relative space-y-4 border-l border-slate-200 pl-5 dark:border-[#2B293E]">
              {items.map((item) => (
                <li key={item.id} className="relative">
                  <span className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-500 dark:border-[#181724]" aria-hidden="true" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.label}</p>
                  {item.detail && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{item.detail}</p>}
                  <p className="mt-0.5 text-xs text-slate-500">
                    <time dateTime={item.at}>{when(item.at)}</time>{item.actor ? ` · ${item.actor}` : ''}
                  </p>
                </li>
              ))}
            </ol>
            {next && <Button variant="secondary" size="sm" className="mt-4" onClick={loadMore} disabled={isLoadingMore}>{isLoadingMore ? 'Loading…' : 'Show older activity'}</Button>}
          </>
        )}
    </Section>
  );
};
