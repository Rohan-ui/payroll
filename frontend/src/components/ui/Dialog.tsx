import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface DialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Buttons along the bottom. */
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

/**
 * A modal dialog: labelled for screen readers, closed with Escape or the close
 * button, focus moved inside on open and returned to where it was on close.
 */
export const Dialog: React.FC<DialogProps> = ({ title, description, onClose, children, footer, size = 'md' }) => {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-dialog-close])');
    (first ?? panel.current)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnTo?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 !mt-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'w-full max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] shadow-2xl focus:outline-none',
          size === 'sm'
            ? 'max-w-md'
            : size === 'lg'
              ? 'max-w-3xl'
              : size === 'xl'
                ? 'max-w-5xl'
                : size === '2xl'
                  ? 'max-w-6xl'
                  : 'max-w-xl',
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-[#2B293E]">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h2>
            {description && <p id={descriptionId} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          <button
            type="button"
            data-dialog-close
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 dark:border-[#2B293E] flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};
