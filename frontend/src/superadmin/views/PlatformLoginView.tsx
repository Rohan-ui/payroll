import React, { useId, useState } from 'react';
import { ShieldCheck, Eye, EyeOff, AlertCircle, Info, Lock } from 'lucide-react';
import { usePlatformAuth } from '../context/PlatformAuthContext';
import { ThemeSwitch } from '../theme/ThemeSwitch';

/**
 * Sign-in for the platform portal. Deliberately separate from the tenant
 * workspace sign-in: platform accounts are provisioned by an operator, so
 * there is no sign-up or self-service reset path here.
 */
export const PlatformLoginView: React.FC = () => {
  const { signIn, isSigningIn, error, notice, clearError } = usePlatformAuth();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSigningIn;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      await signIn(email.trim(), password);
    } catch {
      // The context surfaces the message; keep the user on the form.
      setPassword('');
    }
  };

  const fieldClass =
    'w-full h-11 px-4 rounded-xl border border-hq-border bg-hq-input text-hq-foreground text-sm placeholder:text-hq-subtle-foreground focus:outline-none focus:ring-2 focus:ring-hq-ring focus:border-transparent transition-colors disabled:opacity-60';

  return (
    <div className="min-h-screen bg-hq-background text-hq-foreground flex flex-col">
      <div className="flex justify-end px-4 pt-4">
        <ThemeSwitch compact />
      </div>
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-hq-primary flex items-center justify-center shadow-lg shadow-hq-primary/20 mb-4">
              <ShieldCheck className="w-7 h-7 text-hq-foreground" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Voogyo Platform HQ</h1>
            <p className="text-sm text-hq-muted-foreground mt-2 max-w-xs">
              Restricted console for platform operators. Tenant workspace accounts cannot sign in here.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="bg-hq-card border border-hq-border rounded-2xl p-6 sm:p-7 shadow-xl"
          >
            {notice && (
              <div
                role="status"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-hq-primary/30 bg-hq-primary/10 px-3.5 py-3 text-xs text-hq-link"
              >
                <Info className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                <span>{notice}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                id={errorId}
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-hq-danger/30 bg-hq-danger/10 px-3.5 py-3 text-xs text-hq-danger"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label htmlFor={emailId} className="block text-xs font-semibold text-hq-foreground/90 mb-1.5">
                  Work email
                </label>
                <input
                  id={emailId}
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  disabled={isSigningIn}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) clearError();
                  }}
                  className={fieldClass}
                  placeholder="you@voogyo.com"
                />
              </div>

              <div>
                <label htmlFor={passwordId} className="block text-xs font-semibold text-hq-foreground/90 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id={passwordId}
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    disabled={isSigningIn}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) clearError();
                    }}
                    className={`${fieldClass} pr-12`}
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-hq-muted-foreground hover:text-hq-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded-md p-1"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <Eye className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-hq-primary hover:bg-hq-primary-hover text-hq-primary-foreground text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring focus-visible:ring-offset-2 focus-visible:ring-offset-hq-card disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSigningIn && (
                  <span
                    className="w-4 h-4 border-2 border-hq-primary-foreground/40 border-t-hq-primary-foreground rounded-full animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                {isSigningIn ? 'Signing in…' : 'Sign in to platform'}
              </button>
            </div>

            <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-hq-subtle-foreground">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
              <span>
                Sign-in attempts are recorded. Accounts lock for 15 minutes after five failed
                attempts. Contact another platform administrator if you are locked out.
              </span>
            </p>
          </form>
        </div>
      </main>

      <footer className="px-4 py-5 text-center text-[11px] text-hq-muted-foreground">
        Voogyo Platform HQ — operator access only
      </footer>
    </div>
  );
};
