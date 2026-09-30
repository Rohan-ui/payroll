import React, { useCallback, useEffect, useId, useState } from 'react';
import { Users } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { mailApi, type MailStatus, type MemberMailStatus, type PersonalAccountsPolicy } from '../../api/mail.api';
import { formatDateTime } from '../onboarding/onboarding-format';

const STATUS: Record<MailStatus, { label: string; variant: 'success' | 'danger' | 'neutral' | 'warning' }> = {
  CONNECTED: { label: 'Connected', variant: 'success' },
  FAILED: { label: 'Failing', variant: 'danger' },
  UNTESTED: { label: 'Not tested', variant: 'warning' },
  DISCONNECTED: { label: 'Disconnected', variant: 'neutral' },
};

/**
 * Organization & Settings: whether members may send from their own mail
 * accounts, and which members have connected one. Administrators see the
 * state of each account, never a password.
 */
export const EmailPolicyPanel: React.FC = () => {
  const ids = useId();
  const { can } = useAuth();
  const [policy, setPolicy] = useState<PersonalAccountsPolicy | null>(null);
  const [members, setMembers] = useState<MemberMailStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PersonalAccountsPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const canChange = can('organization.update');
  const canSeeMembers = can('users.view');

  const load = useCallback(() => {
    setError(null);
    mailApi
      .mine()
      .then((mine) => setPolicy(mine.policy.personalAccounts))
      .catch((e: Error) => setError(e.message));
    if (canSeeMembers) mailApi.members().then(setMembers).catch((e: Error) => setError(e.message));
  }, [canSeeMembers]);
  useEffect(load, [load]);

  const save = async (next: PersonalAccountsPolicy) => {
    setSaving(true);
    try {
      setPolicy((await mailApi.setPolicy(next)).personalAccounts);
      setConfirm(null);
      toast.success(next === 'ALLOWED' ? 'Members can now send from their own accounts' : 'All email now goes from the organization’s account');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The email policy could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const connected = members?.filter((m) => m.gmail || m.account?.enabled).length ?? 0;

  return (
    <section aria-labelledby={`${ids}-heading`} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
        <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200/80 flex items-center justify-center text-teal-600">
          <Users className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h3 id={`${ids}-heading`} className="text-sm font-bold text-slate-900">Members’ email accounts</h3>
          <p className="text-[11px] text-slate-500">Whether members send lead emails and everything else from their own accounts</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
          The email settings could not be loaded: {error} <button type="button" onClick={load} className="font-semibold underline">Try again</button>
        </p>
      )}

      {policy === null && !error ? (
        <div className="h-20 rounded-xl bg-slate-100 animate-pulse motion-reduce:animate-none" aria-busy="true"><span className="sr-only" role="status">Loading</span></div>
      ) : policy !== null ? (
        <fieldset>
          <legend className="text-xs font-semibold text-slate-700 mb-2">Emails members send (lead emails, offers, interview invitations…)</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              ['ORGANIZATION_ONLY', 'From the organization’s account', 'Every email goes from the SMTP account above, whoever sends it.'],
              ['ALLOWED', 'From each member’s own account', 'Members who set up their account in My email settings send as themselves; others use the organization’s account.'],
            ] as const).map(([value, title, detail]) => (
              <label key={value} className={`flex gap-2 p-3 rounded-xl border text-sm cursor-pointer ${policy === value ? 'border-teal-400 bg-teal-50/50' : 'border-slate-200'} ${canChange ? '' : 'cursor-default opacity-80'}`}>
                <input type="radio" name={`${ids}-policy`} value={value} checked={policy === value} disabled={!canChange || saving} onChange={() => setConfirm(value)} className="mt-1" />
                <span>
                  <span className="block font-semibold text-slate-900">{title}</span>
                  <span className="block text-xs text-slate-600">{detail}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Automatic emails, such as a candidate’s acceptance confirmation, always go from the organization’s account.</p>
          {!canChange && <p className="mt-1 text-xs text-slate-500">Only administrators who can edit organization settings can change this.</p>}
        </fieldset>
      ) : null}

      {canSeeMembers && members && (
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">{connected} of {members.length} members have connected an email account</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <caption className="sr-only">Members’ email accounts</caption>
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th scope="col" className="text-left font-semibold px-3 py-2">Member</th>
                  <th scope="col" className="text-left font-semibold px-3 py-2">Sends as</th>
                  <th scope="col" className="text-left font-semibold px-3 py-2">Status</th>
                  <th scope="col" className="text-left font-semibold px-3 py-2">Last worked</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.loginEmail} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <span className="block font-medium text-slate-900 break-words">{m.name}</span>
                      <span className="block text-xs text-slate-500 break-all">{m.loginEmail}</span>
                    </td>
                    <td className="px-3 py-2 text-xs break-all">{m.gmail ? `${m.gmail} (Gmail)` : m.account?.enabled ? m.account.senderEmail : '—'}</td>
                    <td className="px-3 py-2">
                      {m.gmail ? (
                        <Badge variant="success" size="sm">Gmail connected</Badge>
                      ) : m.account ? (
                        <Badge variant={STATUS[m.account.smtpStatus].variant} size="sm">{STATUS[m.account.smtpStatus].label}</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Not set up</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{m.account?.smtpLastSuccessAt ? formatDateTime(m.account.smtpLastSuccessAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirm && (
        <Dialog
          title={confirm === 'ALLOWED' ? 'Let members send from their own accounts?' : 'Send all email from the organization’s account?'}
          description={
            confirm === 'ALLOWED'
              ? 'Emails members send will go from the accounts they set up in My email settings. Members without one keep using the organization’s account.'
              : 'Every email, including lead emails members send, will go from the organization’s account. Members’ own accounts are kept but not used for sending.'
          }
          size="sm"
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button type="button" onClick={() => setConfirm(null)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={saving} onClick={() => save(confirm)} className="px-4 py-2 text-sm font-semibold rounded-xl bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Change policy'}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700">It takes effect for the next email sent.</p>
        </Dialog>
      )}
    </section>
  );
};
