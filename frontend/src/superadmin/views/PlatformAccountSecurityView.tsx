import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { encode } from 'uqr';
import {
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Monitor,
  RefreshCw,
} from 'lucide-react';
import {
  platformAuthApi,
  PlatformMfaStatus,
  PlatformMfaEnrollment,
  PlatformSessionSummary,
} from '../api/platform-auth.api';

type EnrollmentStage = 'idle' | 'scanning' | 'confirming';

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );

const Panel: React.FC<{
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className="border border-hq-border rounded-xl bg-hq-card p-5">
    <h2 className="text-sm font-bold text-hq-foreground">{title}</h2>
    <p className="text-xs text-hq-muted-foreground mt-1 mb-4 leading-relaxed">{description}</p>
    {children}
  </section>
);

/**
 * The authenticator setup link as a QR code, drawn here in the browser: the
 * link holds the MFA secret, so it is never sent to a QR service. Always dark
 * on white with a 4-module margin, which authenticator cameras expect.
 */
const SetupQrCode: React.FC<{ uri: string }> = ({ uri }) => {
  const qr = useMemo(() => {
    try {
      return encode(uri, { ecc: 'M', border: 4 });
    } catch {
      return null;
    }
  }, [uri]);
  if (!qr) return null;

  const path = qr.data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
  return (
    <svg
      role="img"
      aria-label="QR code for setting up two-factor authentication"
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      className="w-44 h-44 shrink-0 rounded-lg border border-hq-border"
    >
      <rect width={qr.size} height={qr.size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
};

const RecoveryCodeList: React.FC<{ codes: string[]; onDone: () => void }> = ({ codes, onDone }) => {
  const [copied, setCopied] = useState(false);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-xl border border-hq-warning/30 bg-hq-warning/10 px-3.5 py-3 text-xs text-hq-warning">
        <KeyRound className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
        <span>
          Save these now. Each code works once, they are shown only this time, and they are the only
          way in if you lose your authenticator device.
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {codes.map((code) => (
          <li
            key={code}
            className="px-3 py-2 rounded-lg bg-hq-background border border-hq-border font-mono text-xs text-hq-link text-center"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={copyAll}
          className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-hq-border text-hq-foreground hover:bg-hq-accent text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-hq-success" aria-hidden="true" />
          ) : (
            <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 h-9 text-xs font-bold text-hq-primary-foreground bg-hq-primary hover:bg-hq-primary-hover rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
        >
          I have saved them
        </button>
      </div>
    </div>
  );
};

export const PlatformAccountSecurityView: React.FC = () => {
  const codeFieldId = useId();
  const disablePasswordId = useId();
  const disableCodeId = useId();

  const [status, setStatus] = useState<PlatformMfaStatus | null>(null);
  const [sessions, setSessions] = useState<PlatformSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [stage, setStage] = useState<EnrollmentStage>('idle');
  const [enrollment, setEnrollment] = useState<PlatformMfaEnrollment | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisableForm, setShowDisableForm] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [mfaStatus, sessionList] = await Promise.all([
        platformAuthApi.getMfaStatus(),
        platformAuthApi.listSessions(),
      ]);
      setStatus(mfaStatus);
      setSessions(sessionList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load account security settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const startEnrollment = () =>
    run(async () => {
      const result = await platformAuthApi.beginMfaEnrollment();
      setEnrollment(result);
      setStage('scanning');
    });

  const confirmEnrollment = () =>
    run(async () => {
      const result = await platformAuthApi.confirmMfaEnrollment(confirmCode.trim());
      setRecoveryCodes(result.recoveryCodes);
      setConfirmCode('');
      setEnrollment(null);
      setStage('idle');
      await load();
    });

  const disableMfa = () =>
    run(async () => {
      await platformAuthApi.disableMfa(disablePassword, disableCode.trim());
      setDisablePassword('');
      setDisableCode('');
      setShowDisableForm(false);
      setSuccess('Two-factor authentication is now off. Your recovery codes were destroyed.');
      await load();
    });

  const revokeOthers = () =>
    run(async () => {
      const result = await platformAuthApi.revokeOtherSessions();
      setSuccess(
        result.revoked === 0
          ? 'There were no other sessions to sign out.'
          : `Signed out ${result.revoked} other session${result.revoked === 1 ? '' : 's'}.`,
      );
      await load();
    });

  const fieldClass =
    'w-full h-10 px-3 text-xs rounded-lg border border-hq-border bg-hq-input text-hq-foreground placeholder:text-hq-subtle-foreground focus:outline-none focus:ring-2 focus:ring-hq-ring focus:border-transparent disabled:opacity-60';

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1].map((index) => (
          <div
            key={index}
            className="h-32 rounded-xl bg-hq-card border border-hq-border animate-pulse motion-reduce:animate-none"
          />
        ))}
        <p className="sr-only" role="status">
          Loading account security settings
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-hq-danger/30 bg-hq-danger/10 px-3.5 py-3 text-xs text-hq-danger"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl border border-hq-success/30 bg-hq-success/10 px-3.5 py-3 text-xs text-hq-success"
        >
          <Check className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span>{success}</span>
        </div>
      )}

      {recoveryCodes ? (
        <Panel
          title="Save your recovery codes"
          description="These replace your authenticator app if you lose access to it."
        >
          <RecoveryCodeList codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />
        </Panel>
      ) : (
        <Panel
          title="Two-factor authentication"
          description="A second factor means a stolen or guessed password is not enough to reach the platform console."
        >
          <div className="flex items-start gap-3 mb-4">
            {status?.isEnabled ? (
              <ShieldCheck className="w-5 h-5 text-hq-success shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-hq-warning shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-hq-foreground">
                {status?.isEnabled ? 'Enabled' : 'Not enabled'}
              </p>
              <p className="text-xs text-hq-muted-foreground mt-0.5 leading-relaxed">
                {status?.isEnabled
                  ? `Enrolled ${status.enrolledAt ? formatDateTime(status.enrolledAt) : 'recently'}. ${status.unusedRecoveryCodeCount} recovery code${status.unusedRecoveryCodeCount === 1 ? '' : 's'} unused.`
                  : 'Your account is protected by a password alone. Anyone who obtains it controls every tenant on the platform.'}
              </p>
            </div>
          </div>

          {!status?.isEnabled && stage === 'idle' && (
            <button
              type="button"
              onClick={startEnrollment}
              disabled={isBusy}
              className="px-4 h-10 text-xs font-bold text-hq-primary-foreground bg-hq-primary hover:bg-hq-primary-hover rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
            >
              {isBusy ? 'Preparing…' : 'Set up two-factor authentication'}
            </button>
          )}

          {stage === 'scanning' && enrollment && (
            <div className="space-y-4">
              <ol className="text-xs text-hq-foreground/90 space-y-2 list-decimal list-inside leading-relaxed">
                <li>Open your authenticator app and add a new account.</li>
                <li>Scan the QR code, or paste the setup link or type the secret manually.</li>
                <li>Enter the 6-digit code the app shows to confirm.</li>
              </ol>

              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                <SetupQrCode uri={enrollment.otpauthUri} />
                <div className="flex-1 min-w-0 space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold text-hq-muted-foreground mb-1.5">Secret</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2.5 rounded-lg bg-hq-background border border-hq-border text-hq-link font-mono text-xs break-all">
                        {enrollment.secretFormatted}
                      </code>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(enrollment.secret);
                            setSecretCopied(true);
                            window.setTimeout(() => setSecretCopied(false), 2000);
                          } catch {
                            setSecretCopied(false);
                          }
                        }}
                        className="shrink-0 inline-flex items-center gap-1.5 px-2.5 h-9 rounded-lg border border-hq-border text-hq-foreground hover:bg-hq-accent text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
                      >
                        {secretCopied ? (
                          <Check className="w-3.5 h-3.5 text-hq-success" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {secretCopied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold text-hq-muted-foreground mb-1.5">Setup link</p>
                    <code className="block px-3 py-2.5 rounded-lg bg-hq-background border border-hq-border text-hq-muted-foreground font-mono text-[10px] break-all">
                      {enrollment.otpauthUri}
                    </code>
                  </div>
                </div>
              </div>

              <form
                className="flex flex-col sm:flex-row sm:items-end gap-2.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void confirmEnrollment();
                }}
              >
                <div className="flex-1">
                  <label
                    htmlFor={codeFieldId}
                    className="block text-[11px] font-semibold text-hq-muted-foreground mb-1.5"
                  >
                    6-digit code from your app
                  </label>
                  <input
                    id={codeFieldId}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={confirmCode}
                    disabled={isBusy}
                    onChange={(event) => setConfirmCode(event.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className={`${fieldClass} font-mono tracking-[0.3em] text-center`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isBusy || confirmCode.length !== 6}
                  className="px-4 h-10 text-xs font-bold text-hq-primary-foreground bg-hq-primary hover:bg-hq-primary-hover rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
                >
                  {isBusy ? 'Confirming…' : 'Confirm and enable'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStage('idle');
                    setEnrollment(null);
                    setConfirmCode('');
                  }}
                  disabled={isBusy}
                  className="px-4 h-10 text-xs font-semibold text-hq-foreground/90 hover:bg-hq-accent rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
                >
                  Cancel
                </button>
              </form>
            </div>
          )}

          {status?.isEnabled && (
            <div className="space-y-3">
              {!showDisableForm ? (
                <button
                  type="button"
                  onClick={() => setShowDisableForm(true)}
                  className="px-4 h-10 text-xs font-bold text-hq-danger border border-hq-danger/40 hover:bg-hq-danger/10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-danger"
                >
                  Turn off two-factor authentication
                </button>
              ) : (
                <form
                  className="space-y-3 border-t border-hq-border pt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void disableMfa();
                  }}
                >
                  <p className="text-xs text-hq-danger">
                    Turning this off leaves your password as the only protection for every tenant on
                    the platform. Confirm with your password and a current code.
                  </p>
                  <div>
                    <label
                      htmlFor={disablePasswordId}
                      className="block text-[11px] font-semibold text-hq-muted-foreground mb-1.5"
                    >
                      Current password
                    </label>
                    <input
                      id={disablePasswordId}
                      type="password"
                      autoComplete="current-password"
                      value={disablePassword}
                      disabled={isBusy}
                      onChange={(event) => setDisablePassword(event.target.value)}
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={disableCodeId}
                      className="block text-[11px] font-semibold text-hq-muted-foreground mb-1.5"
                    >
                      Authenticator or recovery code
                    </label>
                    <input
                      id={disableCodeId}
                      type="text"
                      autoComplete="one-time-code"
                      value={disableCode}
                      disabled={isBusy}
                      onChange={(event) => setDisableCode(event.target.value)}
                      className={`${fieldClass} font-mono`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={isBusy || !disablePassword || disableCode.length < 6}
                      className="px-4 h-10 text-xs font-bold text-hq-primary-foreground bg-hq-destructive hover:bg-hq-destructive-hover rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-danger disabled:opacity-50"
                    >
                      {isBusy ? 'Turning off…' : 'Turn off two-factor'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDisableForm(false)}
                      disabled={isBusy}
                      className="px-4 h-10 text-xs font-semibold text-hq-foreground/90 hover:bg-hq-accent rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </Panel>
      )}

      <Panel
        title="Active sessions"
        description="Every device currently signed in to the platform console with your account."
      >
        {sessions.length === 0 ? (
          <p className="text-xs text-hq-muted-foreground">No other sessions are active.</p>
        ) : (
          <ul className="divide-y divide-hq-border border border-hq-border rounded-lg overflow-hidden">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-start gap-3 px-3.5 py-3 bg-hq-input">
                <Monitor className="w-4 h-4 text-hq-subtle-foreground shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-hq-foreground">
                    {session.ipAddress || 'Unknown address'}
                    {session.isCurrent && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-hq-success/15 text-hq-success border border-hq-success/30">
                        THIS DEVICE
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-hq-subtle-foreground mt-0.5 break-words">
                    Last used {formatDateTime(session.lastUsedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={revokeOthers}
            disabled={isBusy || sessions.length <= 1}
            className="px-4 h-10 text-xs font-bold text-hq-foreground border border-hq-border hover:bg-hq-accent rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
          >
            Sign out all other devices
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isBusy}
            aria-label="Refresh sessions"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-hq-border text-hq-foreground/90 hover:bg-hq-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hq-ring disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </Panel>
    </div>
  );
};
