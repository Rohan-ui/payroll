import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { toast, ToastItem } from '../../lib/toast';

const DURATION_MS = { success: 4000, error: 7000 };

/**
 * The portal's view of the app-wide toast channel (`lib/toast`), drawn with
 * the HQ theme tokens. Toasts confirm what the server committed or report
 * what it refused; screens still show errors in context as well.
 */
export const PlatformToaster: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => toast.subscribe(setItems), []);

  return (
    <div className="fixed z-[100] bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 flex flex-col gap-2 sm:w-96 pointer-events-none">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ item: ToastItem }> = ({ item }) => {
  useEffect(() => {
    const timer = window.setTimeout(() => toast.dismiss(item.id), DURATION_MS[item.kind]);
    return () => window.clearTimeout(timer);
  }, [item]);

  const isError = item.kind === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-hq-card px-4 py-3 text-xs shadow-lg ${
        isError ? 'border-hq-danger/40 text-hq-danger' : 'border-hq-success/40 text-hq-success'
      }`}
    >
      {isError ? <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />}
      <span className="flex-1 break-words text-hq-foreground">{item.message}</span>
      <button
        type="button"
        onClick={() => toast.dismiss(item.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 text-hq-muted-foreground hover:text-hq-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};
