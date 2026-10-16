import React, { useEffect, useId, useState } from 'react';
import { errorText, fieldClass, hintClass, labelClass } from '../payroll/payroll-format';

export interface PickerOption { id: string; name: string; code: string }

/**
 * Finds a record by name or code as the person types. The server returns a
 * few matches at a time, so no long list is ever loaded whole.
 */
export const SearchPicker: React.FC<{
  label: string;
  /** What is searched for, in the plural, for messages. */
  noun: string;
  find: (term: string) => Promise<PickerOption[]>;
  onPick: (option: PickerOption) => void;
  exclude?: string[];
  hint?: string;
  disabled?: boolean;
}> = ({ label, noun, find, onPick, exclude = [], hint, disabled }) => {
  const id = useId();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<PickerOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setResults(null); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      find(term)
        .then((found) => { if (live) { setResults(found); setError(null); } })
        .catch((e) => { if (live) setError(errorText(e)); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [search, find]);

  const shown = results?.filter((e) => !exclude.includes(e.id)) ?? null;
  return (
    <div>
      <label htmlFor={`${id}-search`} className={labelClass}>{label}</label>
      <input id={`${id}-search`} type="search" className={fieldClass} value={search} disabled={disabled} placeholder="Type at least 2 letters of a name or code"
        onChange={(e) => setSearch(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} aria-controls={`${id}-results`} />
      {hint && <p id={`${id}-hint`} className={hintClass}>{hint}</p>}
      {error && <p role="alert" className="mt-1 text-xs text-red-700">The {noun} could not be searched: {error}</p>}
      <div id={`${id}-results`} aria-live="polite">
        {shown && shown.length === 0 && <p className={hintClass}>Nothing matches “{search.trim()}”.</p>}
        {shown && shown.length > 0 && (
          <ul className="mt-1 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-[#2B293E] dark:border-[#2B293E]">
            {shown.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => { onPick(e); setSearch(''); setResults(null); }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-teal-50 focus-visible:bg-teal-50 focus-visible:outline-none dark:hover:bg-white/5">
                  <span className="min-w-0 truncate text-slate-800 dark:text-slate-200">{e.name}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-500">{e.code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
