import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { toast, ToastItem } from '../../lib/toast';

const DURATION_MS = { success: 4000, error: 7000 };

/** Shows the toasts raised through `toast`. Rendered once, at the root of the app. */
export const Toaster: React.FC = () => {
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
      className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg ${
        isError
          ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-100'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-100'
      }`}
    >
      {isError ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />}
      <span className="flex-1 break-words">{item.message}</span>
      <button
        type="button"
        onClick={() => toast.dismiss(item.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
};
