import React, { useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { toast } from '../../lib/toast';
import type { EmployeeProfile } from '../../api/employee-profile.api';
import { errorText } from '../payroll/payroll-format';

/** A titled block of the profile, with an optional action on the right. */
export const Section: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode; description?: string }> = ({ title, action, children, description }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-[#2B293E] dark:bg-[#181724]">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
);

/** Label/value pairs; an empty value says it is not recorded instead of inventing one. */
export const Facts: React.FC<{ items: { label: string; value: React.ReactNode }[]; columns?: 1 | 2 | 3 }> = ({ items, columns = 2 }) => (
  <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${columns >= 2 ? 'sm:grid-cols-2' : ''} ${columns === 3 ? 'lg:grid-cols-3' : ''}`}>
    {items.map((item) => (
      <div key={item.label} className="min-w-0">
        <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.label}</dt>
        <dd className="mt-0.5 break-words text-sm text-slate-800 dark:text-slate-100">
          {item.value === null || item.value === undefined || item.value === '' ? <span className="text-slate-400">Not recorded</span> : item.value}
        </dd>
      </div>
    ))}
  </dl>
);

export const EditButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <Button variant="outline" size="sm" onClick={onClick}>{children}</Button>
);

/**
 * A dialog around a form that saves to the server. While saving, the submit
 * button is disabled so nothing is sent twice; a refusal stays in the dialog
 * with the server's reason; success closes it and hands back the saved profile.
 */
export function FormDialog({
  title,
  description,
  submitLabel,
  onSubmit,
  onSaved,
  onClose,
  children,
  danger,
  size,
}: {
  title: string;
  description?: string;
  submitLabel: string;
  onSubmit: () => Promise<EmployeeProfile>;
  onSaved: (profile: EmployeeProfile) => void;
  onClose: () => void;
  children: React.ReactNode;
  danger?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formId = React.useId();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await onSubmit();
      onSaved(saved);
      toast.success(`${title.replace(/\?$/, '')}: saved`);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      title={title}
      description={description}
      onClose={() => !isSaving && onClose()}
      size={size}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} type="submit" form={formId} disabled={isSaving}>
            {isSaving ? 'Saving…' : submitLabel}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
        {children}
      </form>
    </Dialog>
  );
}

/** A labelled input wired to its label and optional hint. */
export const Field: React.FC<{
  label: string;
  hint?: string;
  required?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string }) => React.ReactNode;
}> = ({ label, hint, required, children }) => {
  const id = React.useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
        {label} {required ? <span aria-hidden="true" className="text-red-600">*</span> : <span className="font-normal text-slate-400">(optional)</span>}
      </label>
      {children({ id, 'aria-describedby': hint ? `${id}-hint` : undefined })}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
};

/** Empty text becomes null so the server clears the value rather than storing "". */
export const orNull = (value: string) => (value.trim() === '' ? null : value.trim());
