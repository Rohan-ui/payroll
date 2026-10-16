import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface ComboboxOption {
  id: string;
  label: string;
  /** A second, quieter line, such as a code or a rate. */
  hint?: string;
}

/** An extra entry under the options, such as “Add ‘…’ as a service”. */
export interface ComboboxAction {
  label: string;
  onSelect: () => void;
}

interface ComboboxProps {
  id: string;
  /** What is typed in the box. */
  value: string;
  onInputChange: (text: string) => void;
  options: ComboboxOption[];
  onSelect: (option: ComboboxOption) => void;
  action?: ComboboxAction | null;
  placeholder?: string;
  /** Shown in the list when nothing matches. */
  emptyText?: string;
  /** Shown in the list while matches are being looked up. */
  loading?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

/**
 * A text box with a list of matches under it (the ARIA combobox pattern):
 * type to filter or search, then pick with the mouse or with ↑ ↓ and Enter;
 * Escape closes the list. What the typed text means when nothing is picked is
 * up to the caller (free text, or a search still to be completed).
 */
export const Combobox: React.FC<ComboboxProps> = ({
  id, value, onInputChange, options, onSelect, action, placeholder, emptyText = 'Nothing matches', loading, invalid, describedBy, className,
}) => {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);
  const entries = [...options.map((o) => ({ key: o.id, option: o as ComboboxOption | null, action: null as ComboboxAction | null })), ...(action ? [{ key: '__action', option: null, action }] : [])];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => { setActive((current) => (current >= entries.length ? entries.length - 1 : current)); }, [entries.length]);

  const choose = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    if (entry.option) onSelect(entry.option);
    else entry.action?.onSelect();
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (entries.length ? (current + 1) % entries.length : -1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (entries.length ? (current <= 0 ? entries.length - 1 : current - 1) : -1));
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;
  return (
    <div ref={wrapper} className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onInputChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn('pr-8', className)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? 'Close the list' : 'Open the list'}
        onClick={() => setOpen((o) => !o)}
        className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 hover:text-slate-600"
      >
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
          {loading && !options.length && <li className="px-3 py-2 text-slate-500" aria-live="polite">Searching…</li>}
          {!loading && !options.length && !action && <li className="px-3 py-2 text-slate-500">{emptyText}</li>}
          {entries.map((entry, index) => (
            <li
              key={entry.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={cn('cursor-pointer px-3 py-2', index === active ? 'bg-blue-50 text-blue-900' : 'text-slate-800', entry.action && 'border-t border-slate-100 font-semibold text-blue-700')}
            >
              {entry.option ? (
                <>
                  <span className="block break-words">{entry.option.label}</span>
                  {entry.option.hint && <span className="block text-[11px] text-slate-500">{entry.option.hint}</span>}
                </>
              ) : entry.action?.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
