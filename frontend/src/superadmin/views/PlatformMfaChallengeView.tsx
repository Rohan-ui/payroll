import React, { useEffect, useId, useRef, useState } from 'react';
import { ShieldCheck, AlertCircle, KeyRound, ArrowLeft } from 'lucide-react';
import { usePlatformAuth } from '../context/PlatformAuthContext';
import { ThemeSwitch } from '../theme/ThemeSwitch';

/**
 * Second step of sign-in. The password has been accepted and the session token
 * is held, but it grants nothing until a valid factor is supplied.
 */
export const PlatformMfaChallengeView: React.FC = () => {
  const { submitMfaCode, cancelMfaChallenge, isSigningIn, error, clearError } = usePlatformAuth();
  const codeId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, [useRecoveryCode]);

  const canSubmit = code.trim().length >= 6 && !isSigningIn;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      await submitMfaCode(code.trim());
    } catch {
      setCode('');
      inputRef.current?.focus();
    }
  };

  const fieldClass =
    'w-full h-12 px-4 rounded-xl border border-hq-border bg-hq-input text-hq-foreground placeholder:text-hq-subtle-foreground focus:outline-none focus:ring-2 focus:ring-hq-ring focus:border-transparent transition-colors disabled:opacity-60';

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
            <h1 className="text-2xl font-bold tracking-tight">Two-factor verification</h1>
            <p className="text-sm text-hq-muted-foreground mt-2 max-w-xs">
              {useRecoveryCode
                ? 'Enter one of the recovery codes you saved when you set up two-factor authentication.'
                : 'Enter the current 6-digit code from your authenticator app.'}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            noValidate
            className="bg-hq-card border border-hq-border rounded-2xl p-6 sm:p-7 shadow-xl"
          >
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
                <label htmlFor={codeId} className="block text-xs font-semibold text-hq-foreground/90 mb-1.5">
                  {useRecoveryCode ? 'Recovery code' : 'Authenticator code'}
                </label>
                <input
                  id={codeId}
                  ref={inputRef}
                  type="text"
                  name="one-time-code"
                  inputMode={useRecoveryCode ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  required
                  value={code}
                  disabled={isSigningIn}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  maxLength={useRecoveryCode ? 16 : 6}
                  onChange={(event) => {
                    const next = useRecoveryCode
                      ? event.target.value.toUpperCase()
                      : event.target.value.replace(/\D/g, '');
                    setCode(next);
                    if (error) clearError();
                  }}
                  className={`${fieldClass} ${useRecoveryCode ? 'font-mono tracking-widest' : 'text-center text-2xl tracking-[0.5em] font-mono'}`}
                  placeholder={useRecoveryCode ? 'XXXXX-XXXXX' : '000000'}
                />
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
                {isSigningIn ? 'Verifying…' : 'Verify and continue'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setUseRecoveryCode((current) => !current);
                  setCode('');
                  clearError();
                }}
                className="w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-hq-link hover:text-hq-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded-lg py-1"
              >
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                {useRecoveryCode ? 'Use an authenticator code instead' : 'Use a recovery code instead'}
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={cancelMfaChallenge}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-hq-muted-foreground hover:text-hq-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring rounded-lg py-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            Back to sign in
          </button>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-hq-muted-foreground">
            Lost your device and your recovery codes? Another platform administrator can reset your
            second factor.
          </p>
        </div>
      </main>
    </div>
  );
};
