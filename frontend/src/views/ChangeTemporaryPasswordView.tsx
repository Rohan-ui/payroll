import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { toast } from '../lib/toast';

const MIN_LENGTH = 10;

/**
 * Shown after signing in with the temporary password from an onboarding email.
 * The server refuses every other request from this session until the password
 * is replaced; once it is, the temporary password no longer works.
 */
export const ChangeTemporaryPasswordView: React.FC = () => {
  const { user, activeTenant, completePasswordChange, logout } = useAuth();
  const { theme } = useTheme();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => headingRef.current?.focus(), []);

  const problem =
    password.length > 0 && password.length < MIN_LENGTH
      ? `Use at least ${MIN_LENGTH} characters.`
      : password.length > 0 && password === current
        ? 'Choose a password different from your temporary one.'
        : confirm.length > 0 && confirm !== password
          ? 'The new passwords do not match.'
          : null;
  const canSubmit = current.length > 0 && password.length >= MIN_LENGTH && confirm === password && !problem;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving || !canSubmit) return;
    setIsSaving(true);
    setError(null);
    try {
      await completePasswordChange(current, password);
      toast.success('Password changed successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your password could not be changed.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full h-11 px-4 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-surface p-4 sm:p-10 font-sans">
      <img src={theme === 'dark' ? '/voogyo-woodmark-white.png' : '/voogyo-woodmark.png'} alt="Voogyo" className="h-7 w-auto object-contain mb-8" />
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5" aria-busy={isSaving}>
          <div>
            <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-slate-800 focus:outline-none">
              Choose your new password
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              You signed in{activeTenant ? ` to ${activeTenant.displayName}` : ''} as <span className="font-semibold break-words">{user?.email}</span> with a
              temporary password. Choose your own password to continue; the temporary one stops working as soon as you do.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="temporary-password" className="block text-xs font-bold text-slate-700 mb-1.5">
              Temporary password
            </label>
            <input
              id="temporary-password"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              aria-describedby="temporary-password-hint"
              className={inputClass}
            />
            <p id="temporary-password-hint" className="mt-1 text-xs text-slate-500">
              The one from your onboarding email.
            </p>
          </div>
          <div>
            <label htmlFor="new-password" className="block text-xs font-bold text-slate-700 mb-1.5">
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="new-password-hint"
                className={`${inputClass} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPasswords((value) => !value)}
                aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
                aria-pressed={showPasswords}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                {showPasswords ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
            <p id="new-password-hint" className="mt-1 text-xs text-slate-500">
              At least {MIN_LENGTH} characters.
            </p>
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-xs font-bold text-slate-700 mb-1.5">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type={showPasswords ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={inputClass}
            />
          </div>
          {problem && (
            <p className="text-xs text-red-700" aria-live="polite">
              {problem}
            </p>
          )}
          <button
            type="submit"
            disabled={isSaving || !canSubmit}
            className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {isSaving ? 'Saving…' : 'Set new password and continue'}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full text-sm font-semibold text-slate-600 hover:text-slate-800 hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
};
