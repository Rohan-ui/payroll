import React, { useEffect, useId, useRef } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  busyLabel: string;
  tone: 'danger' | 'primary';
  isBusy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Where focus starts, for a dialog that asks for a value; Cancel otherwise. */
  initialFocus?: React.RefObject<HTMLElement>;
}

/**
 * Confirmation for a high-impact platform action. Focus starts on Cancel, Tab
 * stays inside, Escape cancels, and focus returns to where it was on close.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  children,
  confirmLabel,
  busyLabel,
  tone,
  isBusy,
  error,
  onConfirm,
  onCancel,
  initialFocus,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (initialFocus?.current ?? cancelRef.current)?.focus();
    return () => previouslyFocused?.focus();
  }, [initialFocus]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!isBusy) onCancel();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isBusy, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-hq-overlay/70">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-hq-card border border-hq-border rounded-2xl shadow-2xl"
      >
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              className={`w-5 h-5 shrink-0 mt-px ${tone === 'danger' ? 'text-hq-danger' : 'text-hq-link'}`}
              aria-hidden="true"
            />
            <h2 id={titleId} className="font-bold text-sm text-hq-foreground">
              {title}
            </h2>
          </div>
          <div id={descriptionId} className="text-xs text-hq-foreground/90 leading-relaxed space-y-2">
            {children}
          </div>
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-hq-danger/30 bg-hq-danger/10 px-3 py-2 text-xs text-hq-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
              {error}
            </p>
          )}
        </div>
        <div className="px-5 py-4 border-t border-hq-border flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="h-9 px-3.5 rounded-lg border border-hq-border text-xs font-bold text-hq-foreground hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className={`h-9 px-3.5 rounded-lg text-xs font-bold text-hq-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-hq-card disabled:opacity-60 ${
              tone === 'danger'
                ? 'bg-hq-destructive hover:bg-hq-destructive-hover focus-visible:ring-hq-danger'
                : 'bg-hq-primary hover:bg-hq-primary-hover focus-visible:ring-hq-ring'
            }`}
          >
            {isBusy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
