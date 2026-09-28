import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { toast, ToastItem } from '../../lib/toast';

const DURATION_MS = { success: 4000, error: 7000 };
/** A toast with actions stays long enough to use them. */
const WITH_ACTIONS_MS = 12000;

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
    const timer = window.setTimeout(() => toast.dismiss(item.id), item.actions?.length ? WITH_ACTIONS_MS : DURATION_MS[item.kind]);
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
      <div className="flex-1 min-w-0">
        <span className="break-words">{item.message}</span>
        {item.actions && item.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-3">
            {item.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  toast.dismiss(item.id);
                  action.onClick();
                }}
                className="text-xs font-bold underline underline-offset-2 hover:no-underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
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
