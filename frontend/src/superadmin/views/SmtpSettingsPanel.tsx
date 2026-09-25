import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, Send } from 'lucide-react';
import { platformGovernanceApi, SendOutcome, SmtpSettings } from '../api/platform-governance.api';
import { ErrorBanner, Panel } from '../components/DetailList';
import { StatusBadge } from '../components/StatusBadge';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/form-styles';
import { formatDateTime } from '../format';

type Encryption = 'TLS' | 'SSL' | 'NONE';

const PORTS = [587, 465, 2525, 25];

const ENCRYPTION_LABELS: Record<Encryption, string> = {
  TLS: 'STARTTLS (587)',
  SSL: 'SSL/TLS (465)',
  NONE: 'None',
};

/**
 * The mail server platform email goes through: onboarding now, invitations
 * and alerts later. The password is write-only: the server only says whether
 * one is stored. "Send test email" really sends and reports the server's answer.
 */
export const SmtpSettingsPanel: React.FC = () => {
  const [saved, setSaved] = useState<SmtpSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    host: '',
    port: 587,
    encryption: 'TLS' as Encryption,
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
    replyToEmail: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<SendOutcome | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const apply = (settings: SmtpSettings) => {
    setSaved(settings);
    setForm({
      host: settings.host ?? '',
      port: settings.port ?? 587,
      encryption: settings.encryption ?? 'TLS',
      username: settings.username ?? '',
      password: '',
      fromEmail: settings.fromEmail ?? '',
      fromName: settings.fromName ?? '',
      replyToEmail: settings.replyToEmail ?? '',
    });
  };

  const load = async () => {
    setLoadError(null);
    try {
      apply(await platformGovernanceApi.smtp());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the email settings.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      apply(
        await platformGovernanceApi.saveSmtp({
          host: form.host.trim(),
          port: form.port,
          encryption: form.encryption,
          username: form.username.trim() || undefined,
          password: form.password || undefined,
          fromEmail: form.fromEmail.trim(),
          fromName: form.fromName.trim(),
          replyToEmail: form.replyToEmail.trim() || undefined,
        }),
      );
      setNotice('Email settings saved. Send a test email to check them.');
      setTestResult(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The settings could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const sendTest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isTesting) return;
    setIsTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      setTestResult(await platformGovernanceApi.testSmtp(recipient.trim()));
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'The test could not run.');
    } finally {
      setIsTesting(false);
    }
  };

  if (loadError) return <ErrorBanner message={loadError} onRetry={() => void load()} />;
  if (!saved) {
    return (
      <div role="status" className="h-40 rounded-xl bg-hq-muted animate-pulse motion-reduce:animate-none">
        <span className="sr-only">Loading email settings</span>
      </div>
    );
  }

  const signsIn = form.username.trim() !== '';
  const passwordNeeded = signsIn && !saved.hasPassword && !form.password;
  const canSave =
    form.host.trim().length >= 3 && form.fromEmail.trim() !== '' && form.fromName.trim() !== '' && !passwordNeeded && !(signsIn && form.encryption === 'NONE');

  return (
    <Panel
      title="Email (SMTP)"
      description={
        saved.configured
          ? `Platform email is sent through ${saved.host}:${saved.port}. Last saved ${formatDateTime(saved.updatedAt) ?? 'unknown'}.`
          : 'Not configured: onboarding emails are not sent until a mail server is set up here.'
      }
    >
      <form onSubmit={(event) => void submit(event)} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl" noValidate>
        <div>
          <label htmlFor="smtp-host" className={labelClass}>
            SMTP host <span className="font-normal">(required)</span>
          </label>
          <input id="smtp-host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.zoho.in" spellCheck={false} className={`${fieldClass} font-mono`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="smtp-port" className={labelClass}>
              Port
            </label>
            <select id="smtp-port" value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} className={fieldClass}>
              {PORTS.map((port) => (
                <option key={port} value={port}>
                  {port}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="smtp-encryption" className={labelClass}>
              Security
            </label>
            <select id="smtp-encryption" value={form.encryption} onChange={(e) => setForm({ ...form, encryption: e.target.value as Encryption })} className={fieldClass}>
              {(Object.keys(ENCRYPTION_LABELS) as Encryption[]).map((mode) => (
                <option key={mode} value={mode}>
                  {ENCRYPTION_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="smtp-username" className={labelClass}>
            Username <span className="font-normal">(optional; empty for a server without sign-in)</span>
          </label>
          <input id="smtp-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="off" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="smtp-password" className={labelClass}>
            Password
          </label>
          <input
            id="smtp-password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={saved.hasPassword ? '•••••••• (stored — type to replace)' : ''}
            autoComplete="new-password"
            disabled={!signsIn}
            aria-describedby="smtp-password-hint"
            className={fieldClass}
          />
          <p id="smtp-password-hint" className="mt-1 flex items-center gap-1 text-[11px] text-hq-subtle-foreground">
            <KeyRound className="w-3 h-3" aria-hidden="true" />
            {saved.hasPassword ? 'A password is stored, encrypted. It is never shown again.' : 'Stored encrypted and never shown again.'}
          </p>
        </div>
        <div>
          <label htmlFor="smtp-from-email" className={labelClass}>
            From email <span className="font-normal">(required)</span>
          </label>
          <input id="smtp-from-email" type="email" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="smtp-from-name" className={labelClass}>
            From name <span className="font-normal">(required)</span>
          </label>
          <input id="smtp-from-name" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} placeholder="Voogyo" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="smtp-reply-to" className={labelClass}>
            Reply-to email <span className="font-normal">(optional)</span>
          </label>
          <input id="smtp-reply-to" type="email" value={form.replyToEmail} onChange={(e) => setForm({ ...form, replyToEmail: e.target.value })} className={fieldClass} />
        </div>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!canSave || isSaving} className={primaryButtonClass}>
            {isSaving ? 'Saving…' : 'Save email settings'}
          </button>
          {passwordNeeded && <p className="text-xs text-hq-muted-foreground">Enter the password for this username.</p>}
          {signsIn && form.encryption === 'NONE' && <p className="text-xs text-hq-danger">Choose STARTTLS or SSL/TLS: a password must not be sent unencrypted.</p>}
          {saveError && (
            <p role="alert" className="text-xs text-hq-danger">
              {saveError}
            </p>
          )}
          {notice && (
            <p role="status" className="text-xs text-hq-success">
              {notice}
            </p>
          )}
        </div>
      </form>

      <form onSubmit={(event) => void sendTest(event)} className="mt-6 border-t border-hq-border pt-4 max-w-3xl" noValidate>
        <h3 className="text-sm font-semibold text-hq-foreground">Send test email</h3>
        <p className="text-xs text-hq-muted-foreground mt-1">Sends a real message through the saved settings and reports what the mail server answered.</p>
        <div className="mt-3 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="smtp-test-recipient" className={labelClass}>
              Recipient
            </label>
            <input id="smtp-test-recipient" type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} className={fieldClass} />
          </div>
          <button type="submit" disabled={!saved.configured || isTesting || !recipient.trim()} className={secondaryButtonClass}>
            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="w-3.5 h-3.5" aria-hidden="true" />}
            {isTesting ? 'Sending…' : 'Send test email'}
          </button>
        </div>
        {!saved.configured && <p className="mt-2 text-[11px] text-hq-subtle-foreground">Save the settings first.</p>}
        <div aria-live="polite" className="mt-3 text-xs">
          {testResult && (
            <p className="flex flex-wrap items-center gap-2">
              <StatusBadge status={testResult.status} />
              <span className={testResult.status === 'SENT' ? 'text-hq-foreground' : 'text-hq-danger'}>
                {testResult.status === 'SENT' ? `The server accepted the message for ${recipient.trim()}.` : testResult.error}
              </span>
            </p>
          )}
          {testError && <p className="text-hq-danger">{testError}</p>}
        </div>
      </form>
    </Panel>
  );
};
