import React, { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

/** Space a menu needs below its button before it opens upward instead, in px. */
const MENU_ROOM = 200;

export interface OverflowItem {
  label: string;
  onSelect: () => void;
  icon?: React.ElementType;
  /** A destructive or final action, set apart in red. */
  danger?: boolean;
}

/**
 * Less frequent actions behind one "…" button, so a row or card shows its
 * main content instead of a strip of icons. Arrow keys move, Escape closes
 * and returns focus to the button.
 */
export const OverflowMenu: React.FC<{ label: string; items: OverflowItem[]; align?: 'left' | 'right' }> = ({ label, items, align = 'right' }) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Fixed to the viewport so a scrolling table or card can't clip the menu.
  const [place, setPlace] = useState<React.CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('mousedown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const entries = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); entries[(at + 1) % entries.length]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); entries[(at - 1 + entries.length) % entries.length]?.focus(); }
  };

  if (!items.length) return null;
  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          const roomBelow = window.innerHeight - r.bottom > MENU_ROOM;
          setPlace({
            ...(roomBelow ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
            ...(align === 'right' ? { right: window.innerWidth - r.right } : { left: r.left }),
          });
          setOpen((v) => !v);
        }}
        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100">
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menu} id={id} role="menu" aria-label={label} style={place}
          className="fixed z-50 min-w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-[#2B293E] dark:bg-[#1E1D2D]">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); setOpen(false); item.onSelect(); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm focus:outline-none ${item.danger ? 'text-red-700 hover:bg-red-50 focus:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40 dark:focus:bg-red-950/40' : 'text-slate-700 hover:bg-slate-50 focus:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5 dark:focus:bg-white/5'}`}>
              {item.icon && <item.icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
