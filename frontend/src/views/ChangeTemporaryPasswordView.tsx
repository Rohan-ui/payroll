import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '../api/auth.api';

const MIN_LENGTH = 10;

/**
 * Sets the first password from the one-time link in an onboarding email
 * (`#setup=<token>`). The token never leaves the fragment except in the body
 * of the two setup requests; once used, the person signs in normally.
 */
export const AccountSetupView: React.FC<{ token: string; onDone: (email: string | null) => void }> = ({ token, onDone }) => {
  const [link, setLink] = useState<{ email: string; name: string | null; workspace: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    authApi
      .inspectAccountSetup(token)
      .then(setLink)
      .catch((err) => setLinkError(err instanceof Error ? err.message : 'This setup link cannot be used.'));
  }, [token]);

  const problem =
    password.length > 0 && password.length < MIN_LENGTH
      ? `Use at least ${MIN_LENGTH} characters.`
      : confirm.length > 0 && confirm !== password
        ? 'The passwords do not match.'
        : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving || problem || password.length < MIN_LENGTH || confirm !== password) return;
    setIsSaving(true);
    setError(null);
    try {
      await authApi.completeAccountSetup(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your password could not be set.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    'w-full h-11 px-4 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-surface p-6 sm:p-10 font-sans">
      <img src="/voogyo-woodmark.png" alt="Voogyo" className="h-7 w-auto object-contain mb-8" />
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        {done ? (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto" aria-hidden="true" />
            <h1 className="text-xl font-bold text-slate-800">Your password is set</h1>
            <p className="text-sm text-slate-600">
              Sign in to {link?.workspace ?? 'your workspace'} with {link?.email ?? 'your email'} and your new password.
            </p>
            <button
              type="button"
              onClick={() => onDone(link?.email ?? null)}
              className="w-full h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              Sign in
            </button>
          </div>
        ) : linkError ? (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-slate-800">This link cannot be used</h1>
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {linkError}
            </p>
            <button type="button" onClick={() => onDone(null)} className="text-sm font-semibold text-teal-700 hover:underline">
              Go to sign in
            </button>
          </div>
        ) : !link ? (
          <div role="status" className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Checking your link…
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Set your password</h1>
              <p className="text-sm text-slate-600 mt-1">
                {link.name ? `${link.name}, choose` : 'Choose'} a password for <span className="font-semibold">{link.email}</span> in{' '}
                <span className="font-semibold">{link.workspace}</span>.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                {error}
              </p>
            )}
            <div>
              <label htmlFor="setup-password" className="block text-xs font-bold text-slate-700 mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  id="setup-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby="setup-password-hint"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-700 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                </button>
              </div>
              <p id="setup-password-hint" className="mt-1 text-xs text-slate-500">
                At least {MIN_LENGTH} characters.
              </p>
            </div>
            <div>
              <label htmlFor="setup-confirm" className="block text-xs font-bold text-slate-700 mb-1.5">
                Confirm password
              </label>
              <input
                id="setup-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className={inputClass}
              />
            </div>
            {problem && <p className="text-xs text-red-700">{problem}</p>}
            <button
              type="submit"
              disabled={isSaving || Boolean(problem) || password.length < MIN_LENGTH || confirm !== password}
              className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {isSaving ? 'Setting password…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
};
