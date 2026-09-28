import React, { useId, useState } from 'react';
import { platformOperationsApi } from '../api/platform-operations.api';
import { toast } from '../../lib/toast';
import { EMAIL, Field, PHONE } from './FormField';
import { fieldClass, primaryButtonClass, secondaryButtonClass } from './form-styles';

interface Identity {
  name: string | null;
  email: string;
  phone: string | null;
}

/**
 * Edits a global user account's name, sign-in email and phone. The account is
 * shared by every workspace the person belongs to, so this changes it everywhere;
 * memberships and roles are not touched.
 */
export const UserIdentityForm: React.FC<{
  userId: string;
  initial: Identity;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}> = ({ userId, initial, onSaved, onCancel }) => {
  const formId = useId();
  const [name, setName] = useState(initial.name ?? '');
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [problems, setProblems] = useState<{ name?: string; email?: string; phone?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const emailChanged = email.trim().toLowerCase() !== initial.email;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    const found = {
      ...(name.trim() ? {} : { name: 'Enter a name.' }),
      ...(EMAIL.test(email.trim()) ? {} : { email: 'Enter a valid email address.' }),
      ...(phone.trim() && !PHONE.test(phone.trim()) ? { phone: 'Digits only, optionally starting with a country code such as +91.' } : {}),
    };
    setProblems(found);
    if (Object.keys(found).length > 0) return;

    setIsSaving(true);
    setError(null);
    try {
      await platformOperationsApi.updateUser(userId, { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() });
      toast.success('User updated successfully');
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The user could not be updated.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} noValidate aria-busy={isSaving} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field id={`${formId}-name`} label="Name" required error={problems.name}>
          {(props) => <input {...props} value={name} maxLength={160} autoComplete="name" onChange={(e) => setName(e.target.value)} className={fieldClass} />}
        </Field>
        <Field
          id={`${formId}-email`}
          label="Sign-in email"
          required
          error={problems.email}
          hint={emailChanged ? 'They will sign in with this address from now on, in every workspace.' : undefined}
        >
          {(props) => <input {...props} type="email" value={email} maxLength={320} autoComplete="email" onChange={(e) => setEmail(e.target.value)} className={fieldClass} />}
        </Field>
        <Field id={`${formId}-phone`} label="Phone" error={problems.phone}>
          {(props) => <input {...props} type="tel" value={phone} maxLength={24} autoComplete="tel" onChange={(e) => setPhone(e.target.value)} className={fieldClass} />}
        </Field>
      </div>
      <p className="text-[11px] text-hq-subtle-foreground">
        This is the person&apos;s own account, shared by every workspace they belong to. Their memberships and roles are not changed.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-hq-danger/30 bg-hq-danger/10 px-3 py-2 text-xs text-hq-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isSaving} className={primaryButtonClass}>
          {isSaving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} disabled={isSaving} className={secondaryButtonClass}>
          Cancel
        </button>
      </div>
    </form>
  );
};
