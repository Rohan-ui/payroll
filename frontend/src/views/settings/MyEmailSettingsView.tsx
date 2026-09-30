import React, { useCallback, useEffect, useId, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { mailApi, type MailAccount, type MailAccountInput, type MailProvider, type MailSecurity, type MailStatus, type MyMail } from '../../api/mail.api';
import { fieldClass, formatDateTime, labelClass } from '../onboarding/onboarding-format';

const STATUS: Record<MailStatus, { label: string; variant: 'success' | 'danger' | 'neutral' | 'warning' }> = {
  CONNECTED: { label: 'Connected', variant: 'success' },
  FAILED: { label: 'Connection failed', variant: 'danger' },
  UNTESTED: { label: 'Not tested yet', variant: 'warning' },
  DISCONNECTED: { label: 'Disconnected', variant: 'neutral' },
};
const actionClass = 'px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-[#2B293E] hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50';
const primaryClass = 'px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50';
const cardClass = 'p-5 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724]';

interface Form {
  provider: MailProvider;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: MailSecurity;
  smtpUsername: string;
  smtpPassword: string;
  senderEmail: string;
  senderName: string;
  replyToEmail: string;
  imapEnabled: boolean;
  imapHost: string;
  imapPort: string;
  imapSecurity: MailSecurity;
  imapUsername: string;
  imapUsesSmtpPassword: boolean;
  imapPassword: string;
}

const formOf = (account: MailAccount | null, fallbackEmail: string, displayName: string): Form => ({
  provider: account?.provider ?? 'GMAIL',
  smtpHost: account?.smtpHost ?? 'smtp.gmail.com',
  smtpPort: String(account?.smtpPort ?? 465),
  smtpSecurity: account?.smtpSecurity ?? 'SSL',
  smtpUsername: account?.smtpUsername ?? fallbackEmail,
  smtpPassword: '',
  senderEmail: account?.senderEmail ?? fallbackEmail,
  senderName: account?.senderName ?? displayName,
  replyToEmail: account?.replyToEmail ?? '',
  imapEnabled: account?.imapEnabled ?? false,
  imapHost: account?.imapHost ?? 'imap.gmail.com',
  imapPort: String(account?.imapPort ?? 993),
  imapSecurity: account?.imapSecurity ?? 'SSL',
  imapUsername: account?.imapUsername ?? '',
  imapUsesSmtpPassword: account ? account.imapUsesSmtpPassword || !account.hasImapPassword : true,
  imapPassword: '',
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The signed-in member's own mail account: send as themselves (SMTP) and read
 * their inbox in Email & Marketing (IMAP). The saved password is never shown
 * or sent back; only whether one is saved.
 */
export const MyEmailSettingsView: React.FC = () => {
  const ids = useId();
  const { user } = useAuth();
  const [data, setData] = useState<MyMail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [dialog, setDialog] = useState<'test-email' | 'disconnect' | null>(null);
  const [recipient, setRecipient] = useState('');

  const load = useCallback(() => {
    setError(null);
    mailApi.mine().then(setData).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const startEditing = () => {
    if (!data) return;
    setForm(formOf(data.account, user?.email ?? '', user?.displayName ?? ''));
    setFormError(null);
    setResult(null);
    setEditing(true);
  };

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'That did not work. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div role="alert" className="max-w-3xl p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-800">
        Your email settings could not be loaded: {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
      </div>
    );
  }
  if (!data) {
    return <div className="max-w-3xl h-48 rounded-2xl bg-slate-100 dark:bg-[#1E1D2D] animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading your email settings</span></div>;
  }

  const account = data.account;
  const showForm = editing || !account || !account.enabled;
  const preset = data.providers.find((p) => p.code === form?.provider);

  const sendsFromText =
    data.sendsFrom === 'GMAIL'
      ? `your Gmail, ${data.gmail.email}`
      : data.sendsFrom === 'PERSONAL' && account
        ? `your account, ${account.senderEmail}`
        : 'the organization’s email account';

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">My email settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Your own mail account, to send emails as yourself and read your inbox in Email &amp; Marketing. Only you can see or change it.</p>
      </div>

      <section aria-labelledby={`${ids}-sending`} className={cardClass}>
        <h2 id={`${ids}-sending`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Emails you send</h2>
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
          Emails you send, such as lead emails and offer letters, go out from <strong>{sendsFromText}</strong>.
        </p>
        {data.policy.personalAccounts !== 'ALLOWED' && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Your workspace sends all email from the organization’s account. An administrator can allow personal accounts in Organization &amp; Settings; until then your account below is used only for reading your inbox.
          </p>
        )}
        {data.policy.personalAccounts === 'ALLOWED' && !account?.enabled && !data.gmail.connected && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Set up your account below to send as yourself.</p>
        )}
        {data.gmail.connected && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Your Gmail connected in Email &amp; Marketing is used first. The account below is used only if you disconnect Gmail.
          </p>
        )}
      </section>

      {result && (
        <div role={result.ok ? 'status' : 'alert'} className={`p-3 rounded-xl border text-sm flex items-start justify-between gap-3 ${result.ok ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-red-200 bg-red-50 text-red-800'}`}>
          <span className="break-words">{result.message}</span>
          <button type="button" onClick={() => setResult(null)} className="text-xs font-semibold underline shrink-0">Dismiss</button>
        </div>
      )}

      {account && account.enabled && !editing && (
        <section aria-labelledby={`${ids}-account`} className={`${cardClass} space-y-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`${ids}-account`} className="text-sm font-bold text-slate-900 dark:text-slate-100">Email account</h2>
              <p className="text-sm text-slate-800 dark:text-slate-200 break-all">{account.senderName ? `${account.senderName} <${account.senderEmail}>` : account.senderEmail}</p>
              <p className="text-xs text-slate-500">
                {data.providers.find((p) => p.code === account.provider)?.label} · {account.smtpHost}:{account.smtpPort} · password saved
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={startEditing} className={actionClass}>Edit</button>
              <button type="button" disabled={busy !== null} onClick={() => run('smtp', async () => { const r = await mailApi.testSmtp(); setResult(r); load(); })} className={actionClass}>
                {busy === 'smtp' ? 'Testing…' : 'Test connection'}
              </button>
              {account.imapEnabled && (
                <button type="button" disabled={busy !== null} onClick={() => run('imap', async () => { const r = await mailApi.testImap(); setResult(r); load(); })} className={actionClass}>
                  {busy === 'imap' ? 'Testing…' : 'Test inbox'}
                </button>
              )}
              <button type="button" onClick={() => { setRecipient(user?.email ?? ''); setDialog('test-email'); }} className={actionClass}>Send test email</button>
              <button type="button" onClick={() => setDialog('disconnect')} className={`${actionClass} text-red-700`}>Disconnect</button>
            </div>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <StatusBlock label="Sending (SMTP)" status={account.smtpStatus} lastSuccess={account.smtpLastSuccessAt} lastTested={account.smtpLastTestedAt} error={account.smtpLastError} />
            {account.imapEnabled ? (
              <StatusBlock label="Inbox (IMAP)" status={account.imapStatus} lastSuccess={account.imapLastSuccessAt} lastTested={account.imapLastTestedAt} error={account.imapLastError} />
            ) : (
              <div>
                <dt className="text-xs text-slate-500">Inbox (IMAP)</dt>
                <dd className="text-slate-700 dark:text-slate-300">Not set up. Edit to read your inbox in Email &amp; Marketing.</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {showForm && (
        <AccountForm
          ids={ids}
          form={form ?? formOf(account, user?.email ?? '', user?.displayName ?? '')}
          setForm={setForm}
          account={account}
          providers={data.providers}
          preset={preset ?? data.providers.find((p) => p.code === (form?.provider ?? account?.provider ?? 'GMAIL'))}
          error={formError}
          busy={busy === 'save'}
          canCancel={Boolean(account?.enabled)}
          onCancel={() => { setEditing(false); setFormError(null); }}
          onSubmit={(input, problem) => {
            if (problem) return setFormError(problem);
            setFormError(null);
            run('save', async () => {
              try {
                setData(await mailApi.save(input));
                setEditing(false);
                setForm(null);
                toast.success('Mail account saved. Test the connection to check it works.');
              } catch (e) {
                setFormError(e instanceof Error ? e.message : 'The account could not be saved.');
              }
            });
          }}
        />
      )}

      {dialog === 'test-email' && (
        <Dialog
          title="Send a test email"
          description={`It goes from ${account?.senderEmail} through your own account, to the address below.`}
          size="sm"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" onClick={() => setDialog(null)} className={actionClass}>Cancel</button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (!EMAIL.test(recipient.trim())) return setResult({ ok: false, message: 'Enter the address to send the test email to.' });
                  run('email', async () => { const r = await mailApi.sendTestEmail(recipient.trim()); setResult(r); setDialog(null); load(); });
                }}
                className={primaryClass}
              >
                {busy === 'email' ? 'Sending…' : 'Send test email'}
              </button>
            </>
          }
        >
          <label htmlFor={`${ids}-recipient`} className={labelClass}>Send to *</label>
          <input id={`${ids}-recipient`} type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={320} className={fieldClass} />
        </Dialog>
      )}

      {dialog === 'disconnect' && (
        <Dialog
          title="Disconnect your mail account?"
          description="Its saved passwords are deleted from Voogyo. Emails you send will go from the organization’s account, and your inbox will no longer show in Email & Marketing."
          size="sm"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" onClick={() => setDialog(null)} className={actionClass}>Cancel</button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run('disconnect', async () => { setData(await mailApi.disconnect()); setDialog(null); setEditing(false); toast.success('Mail account disconnected'); })}
                className="px-4 py-2 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect account'}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700 dark:text-slate-300">You can connect it again at any time; you’ll need to enter the password again.</p>
        </Dialog>
      )}
    </div>
  );
};

const StatusBlock: React.FC<{ label: string; status: MailStatus; lastSuccess: string | null; lastTested: string | null; error: string | null }> = ({ label, status, lastSuccess, lastTested, error }) => (
  <div>
    <dt className="text-xs text-slate-500">{label}</dt>
    <dd className="mt-0.5 space-y-1">
      <Badge variant={STATUS[status].variant} size="sm">{STATUS[status].label}</Badge>
      <p className="text-xs text-slate-600 dark:text-slate-400">{lastSuccess ? `Last worked ${formatDateTime(lastSuccess)}` : lastTested ? `Last tested ${formatDateTime(lastTested)}` : 'Not tested yet'}</p>
      {status === 'FAILED' && error && <p className="text-xs text-red-700 dark:text-red-300 break-words">{error}</p>}
    </dd>
  </div>
);

const AccountForm: React.FC<{
  ids: string;
  form: Form;
  setForm: (form: Form) => void;
  account: MailAccount | null;
  providers: MyMail['providers'];
  preset: MyMail['providers'][number] | undefined;
  error: string | null;
  busy: boolean;
  canCancel: boolean;
  onCancel: () => void;
  onSubmit: (input: MailAccountInput, problem: string | null) => void;
}> = ({ ids, form, setForm, account, providers, preset, error, busy, canCancel, onCancel, onSubmit }) => {
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value });
  const smtpSame = Boolean(account?.hasSmtpPassword && account.smtpHost === form.smtpHost.trim().toLowerCase() && String(account.smtpPort) === form.smtpPort && account.smtpUsername === form.smtpUsername.trim());

  const chooseProvider = (code: MailProvider) => {
    const next = providers.find((p) => p.code === code);
    setForm({
      ...form,
      provider: code,
      ...(next?.smtp ? { smtpHost: next.smtp.host, smtpPort: String(next.smtp.port), smtpSecurity: next.smtp.security } : {}),
      ...(next?.imap ? { imapHost: next.imap.host, imapPort: String(next.imap.port), imapSecurity: next.imap.security } : {}),
      ...(next?.senderMustMatchUsername ? { senderEmail: form.smtpUsername } : {}),
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const port = Number(form.smtpPort);
    const imapPort = Number(form.imapPort);
    let problem: string | null = null;
    if (!form.smtpHost.trim()) problem = 'Enter the SMTP host.';
    else if (!(port >= 1 && port <= 65535)) problem = 'Enter an SMTP port between 1 and 65535.';
    else if (!form.smtpUsername.trim()) problem = 'Enter the SMTP username, usually your full email address.';
    else if (!form.smtpPassword && !smtpSame) problem = account?.hasSmtpPassword ? 'You changed the server or username: enter the password again.' : 'Enter the password or app password.';
    else if (!EMAIL.test(form.senderEmail.trim())) problem = 'Enter the email address you send from.';
    else if (preset?.senderMustMatchUsername && form.senderEmail.trim().toLowerCase() !== form.smtpUsername.trim().toLowerCase()) problem = `${preset.label} only sends as the address you sign in with, so the sender email must be ${form.smtpUsername.trim()}.`;
    else if (form.replyToEmail.trim() && !EMAIL.test(form.replyToEmail.trim())) problem = 'Enter a valid reply-to address, or leave it empty.';
    else if (/[\r\n<>"]/.test(form.senderName)) problem = 'The display name must be one line, without < > or quotation marks.';
    else if (form.imapEnabled && (!form.imapHost.trim() || !(imapPort >= 1 && imapPort <= 65535))) problem = 'Enter the IMAP host and port, or turn off reading your inbox.';
    else if (form.imapEnabled && !form.imapUsesSmtpPassword && !form.imapPassword && !account?.hasImapPassword) problem = 'Enter the IMAP password.';
    onSubmit(
      {
        provider: form.provider,
        smtpHost: form.smtpHost.trim(),
        smtpPort: port,
        smtpSecurity: form.smtpSecurity,
        smtpUsername: form.smtpUsername.trim(),
        ...(form.smtpPassword ? { smtpPassword: form.smtpPassword } : {}),
        senderEmail: form.senderEmail.trim(),
        ...(form.senderName.trim() ? { senderName: form.senderName.trim() } : {}),
        ...(form.replyToEmail.trim() ? { replyToEmail: form.replyToEmail.trim() } : {}),
        imapEnabled: form.imapEnabled,
        ...(form.imapEnabled
          ? {
              imapHost: form.imapHost.trim(),
              imapPort,
              imapSecurity: form.imapSecurity,
              imapUsername: form.imapUsername.trim() || form.smtpUsername.trim(),
              imapUsesSmtpPassword: form.imapUsesSmtpPassword,
              ...(!form.imapUsesSmtpPassword && form.imapPassword ? { imapPassword: form.imapPassword } : {}),
            }
          : {}),
      },
      problem,
    );
  };

  const securityOptions = (
    <>
      <option value="SSL">SSL/TLS</option>
      <option value="STARTTLS">STARTTLS</option>
    </>
  );

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${ids}-form`} className={`${cardClass} space-y-5`}>
      <div>
        <h2 id={`${ids}-form`} className="text-sm font-bold text-slate-900 dark:text-slate-100">{account?.enabled ? 'Edit your mail account' : 'Connect your mail account'}</h2>
        <p className="text-xs text-slate-500">Nothing is sent when you save. Test the connection afterwards.</p>
      </div>
      {error && <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error}</p>}

      <div>
        <label htmlFor={`${ids}-provider`} className={labelClass}>Provider</label>
        <select id={`${ids}-provider`} value={form.provider} onChange={(e) => chooseProvider(e.target.value as MailProvider)} className={fieldClass}>
          {providers.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
        </select>
        {preset && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{preset.note}</p>}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Sending (SMTP)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-smtp-host`} className={labelClass}>SMTP host *</label>
            <input id={`${ids}-smtp-host`} value={form.smtpHost} onChange={(e) => set('smtpHost', e.target.value)} maxLength={253} autoComplete="off" className={fieldClass} />
          </div>
          <div>
            <label htmlFor={`${ids}-smtp-port`} className={labelClass}>Port *</label>
            <input id={`${ids}-smtp-port`} inputMode="numeric" value={form.smtpPort} onChange={(e) => set('smtpPort', e.target.value.replace(/\D/g, ''))} className={fieldClass} />
          </div>
          <div>
            <label htmlFor={`${ids}-smtp-security`} className={labelClass}>Security</label>
            <select id={`${ids}-smtp-security`} value={form.smtpSecurity} onChange={(e) => set('smtpSecurity', e.target.value as MailSecurity)} className={fieldClass}>{securityOptions}</select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${ids}-smtp-user`} className={labelClass}>Username *</label>
            <input
              id={`${ids}-smtp-user`}
              value={form.smtpUsername}
              onChange={(e) => setForm({ ...form, smtpUsername: e.target.value, ...(preset?.senderMustMatchUsername ? { senderEmail: e.target.value } : {}) })}
              maxLength={320}
              autoComplete="off"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-smtp-pass`} className={labelClass}>Password or app password {smtpSame ? '' : '*'}</label>
            <input id={`${ids}-smtp-pass`} type="password" value={form.smtpPassword} onChange={(e) => set('smtpPassword', e.target.value)} maxLength={512} autoComplete="new-password" placeholder={smtpSame ? 'Saved. Leave empty to keep it' : ''} className={fieldClass} />
            {account?.hasSmtpPassword && !smtpSame && <p className="mt-1 text-xs text-amber-700">You changed the server or username, so enter the password again.</p>}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Sender</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${ids}-sender`} className={labelClass}>Sender email *</label>
            <input id={`${ids}-sender`} type="email" value={form.senderEmail} onChange={(e) => set('senderEmail', e.target.value)} readOnly={preset?.senderMustMatchUsername} maxLength={320} className={fieldClass} />
            {preset?.senderMustMatchUsername && <p className="mt-1 text-xs text-slate-500">Always your sign-in address with this provider.</p>}
          </div>
          <div>
            <label htmlFor={`${ids}-name`} className={labelClass}>Display name</label>
            <input id={`${ids}-name`} value={form.senderName} onChange={(e) => set('senderName', e.target.value)} maxLength={160} placeholder="Neha Mishra | Business Development" className={fieldClass} />
          </div>
          <div>
            <label htmlFor={`${ids}-reply`} className={labelClass}>Reply-to email</label>
            <input id={`${ids}-reply`} type="email" value={form.replyToEmail} onChange={(e) => set('replyToEmail', e.target.value)} maxLength={320} className={fieldClass} />
            <p className="mt-1 text-xs text-slate-500">Optional. Replies go here instead of the sender email.</p>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Inbox (IMAP)</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.imapEnabled} onChange={(e) => set('imapEnabled', e.target.checked)} />
          Read my inbox in Email &amp; Marketing
        </label>
        {form.imapEnabled && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor={`${ids}-imap-host`} className={labelClass}>IMAP host *</label>
                <input id={`${ids}-imap-host`} value={form.imapHost} onChange={(e) => set('imapHost', e.target.value)} maxLength={253} autoComplete="off" className={fieldClass} />
              </div>
              <div>
                <label htmlFor={`${ids}-imap-port`} className={labelClass}>Port *</label>
                <input id={`${ids}-imap-port`} inputMode="numeric" value={form.imapPort} onChange={(e) => set('imapPort', e.target.value.replace(/\D/g, ''))} className={fieldClass} />
              </div>
              <div>
                <label htmlFor={`${ids}-imap-security`} className={labelClass}>Security</label>
                <select id={`${ids}-imap-security`} value={form.imapSecurity} onChange={(e) => set('imapSecurity', e.target.value as MailSecurity)} className={fieldClass}>{securityOptions}</select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${ids}-imap-user`} className={labelClass}>IMAP username</label>
                <input id={`${ids}-imap-user`} value={form.imapUsername} onChange={(e) => set('imapUsername', e.target.value)} maxLength={320} placeholder={form.smtpUsername || 'Same as SMTP'} autoComplete="off" className={fieldClass} />
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm mt-6">
                  <input type="checkbox" checked={form.imapUsesSmtpPassword} onChange={(e) => set('imapUsesSmtpPassword', e.target.checked)} />
                  Use the same password as sending
                </label>
                {!form.imapUsesSmtpPassword && (
                  <div>
                    <label htmlFor={`${ids}-imap-pass`} className={labelClass}>IMAP password</label>
                    <input id={`${ids}-imap-pass`} type="password" value={form.imapPassword} onChange={(e) => set('imapPassword', e.target.value)} maxLength={512} autoComplete="new-password" placeholder={account?.hasImapPassword ? 'Saved. Leave empty to keep it' : ''} className={fieldClass} />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        {canCancel && <button type="button" onClick={onCancel} className={actionClass}>Cancel</button>}
        <button type="submit" disabled={busy} className={primaryClass}>{busy ? 'Saving…' : 'Save mail account'}</button>
      </div>
    </form>
  );
};
