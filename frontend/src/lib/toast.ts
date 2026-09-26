/**
 * The workspace's one toast channel. Anything can raise a toast, including
 * code outside React (the API client); <Toaster /> shows them.
 */

export type ToastKind = 'success' | 'error';

/** A follow-up the person can take straight from the toast, e.g. "Open lead". */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  actions?: ToastAction[];
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
/** The same message raised again within this window is shown once. */
const DUPLICATE_WINDOW_MS = 1500;
const recent = new Map<string, number>();

const emit = () => listeners.forEach((listener) => listener(toasts));

function show(kind: ToastKind, message: string, actions?: ToastAction[]) {
  const text = message.trim();
  if (!text) return;
  const key = `${kind}:${text}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - DUPLICATE_WINDOW_MS) return;
  recent.set(key, now);
  toasts = [...toasts.slice(-3), { id: nextId++, kind, message: text, ...(actions?.length ? { actions } : {}) }];
  emit();
}

export const toast = {
  success: (message: string, options?: { actions?: ToastAction[] }) => show('success', message, options?.actions),
  error: (message: string) => show('error', message),
  dismiss(id: number) {
    toasts = toasts.filter((item) => item.id !== id);
    emit();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(toasts);
    return () => listeners.delete(listener);
  },
  /** Clears everything; for tests. */
  reset() {
    toasts = [];
    recent.clear();
    emit();
  },
};
