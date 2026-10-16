import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../lib/toast';
import { employeeRelationsApi, type LoginLink } from '../../api/employee-relations.api';
import { errorText } from '../payroll/payroll-format';
import { SearchPicker } from '../performance/SearchPicker';

/**
 * Which workspace sign-in is this employee's. It lets them self-assess and
 * lets reviewers be found from reporting lines. A member whose sign-in
 * email matches the work email is suggested, never linked automatically.
 */
export const SignInCard: React.FC<{ employeeId: string; name: string }> = ({ employeeId, name }) => {
  const { can } = useAuth();
  const manage = can('people.login.manage');
  const [login, setLogin] = useState<LoginLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const load = useCallback(() => {
    setError(null);
    employeeRelationsApi.login(employeeId).then(setLogin).catch((e) => setError(errorText(e)));
  }, [employeeId]);
  useEffect(load, [load]);
  const find = useCallback((term: string) => employeeRelationsApi.candidates(employeeId, term), [employeeId]);

  const link = async (tenantMemberId: string, who: string) => {
    setBusy(true);
    try {
      setLogin(await employeeRelationsApi.link(employeeId, tenantMemberId));
      toast.success(`${name} is linked to ${who}’s sign-in`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    setConfirmUnlink(false);
    setBusy(true);
    try {
      setLogin(await employeeRelationsApi.unlink(employeeId));
      toast.success('Sign-in unlinked');
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-teal-500" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sign-in account</h3>
      </div>
      {error && <p role="alert" className="text-xs text-red-700">The sign-in account could not be loaded: {error} <button type="button" className="font-semibold underline" onClick={load}>Try again</button></p>}
      {!login && !error && <div className="h-10 animate-pulse rounded bg-slate-50 motion-reduce:animate-none dark:bg-white/5" aria-busy="true"><span className="sr-only" role="status">Loading sign-in account</span></div>}
      {login && (
        <div className="space-y-3 text-xs">
          {login.linked ? (
            <p className="text-slate-700 dark:text-slate-200">
              Linked to <span className="font-semibold">{login.linked.name}</span>{login.linked.email ? ` (${login.linked.email})` : ''}
              {!login.linked.active && <span className="block text-amber-700">That member is no longer active, so they can’t sign in or review.</span>}
            </p>
          ) : login.linkedOutsideWorkspace ? (
            <p className="text-amber-700">Linked to a sign-in that is not a member of this workspace.</p>
          ) : (
            <p className="text-slate-500">Not linked. Without a sign-in, {name} can’t self-assess or be found as a reviewer.</p>
          )}
          {manage && (login.linked || login.linkedOutsideWorkspace) && <Button size="sm" variant="ghost" onClick={() => setConfirmUnlink(true)} disabled={busy}>Unlink</Button>}
          {manage && !login.linked && !login.linkedOutsideWorkspace && (
            <>
              {login.suggestions.map((s) => (
                <p key={s.tenantMemberId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50/60 p-2 dark:border-teal-800 dark:bg-teal-950/30">
                  <span>Same work email: <span className="font-semibold">{s.name}</span> ({s.email})</span>
                  <Button size="sm" onClick={() => link(s.tenantMemberId, s.name)} disabled={busy}>Link</Button>
                </p>
              ))}
              <SearchPicker label="Link a member" noun="members" find={find} onPick={(m) => link(m.id, m.name)} hint="Members already linked to another employee aren’t listed." disabled={busy} />
            </>
          )}
        </div>
      )}
      {confirmUnlink && login && (
        <Dialog title={`Unlink ${login.linked ? `${login.linked.name}’s sign-in` : 'the sign-in'} from ${name}?`} onClose={() => setConfirmUnlink(false)} size="sm"
          footer={<><Button variant="outline" onClick={() => setConfirmUnlink(false)}>Keep it</Button><Button variant="danger" onClick={unlink}>Unlink</Button></>}>
          <p className="text-sm text-slate-700 dark:text-slate-300">{name} will no longer be able to self-assess, and won’t be found as a reviewer, until a sign-in is linked again.</p>
        </Dialog>
      )}
    </Card>
  );
};
