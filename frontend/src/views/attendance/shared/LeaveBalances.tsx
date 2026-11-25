import React, { useEffect, useState } from 'react';
import { employeeProfileApi, type LeaveBalance } from '../../../api/employee-profile.api';
import { useAuth } from '../../../context/AuthContext';
import { errorText } from '../../payroll/payroll-format';

/** The employee's real leave balances from the leave module; hidden without leave.view. */
export const LeaveBalances: React.FC<{ employeeId: string }> = ({ employeeId }) => {
  const { can } = useAuth();
  const allowed = can('leave.view');
  const [balances, setBalances] = useState<LeaveBalance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    setBalances(null);
    setError(null);
    employeeProfileApi.leaveBalances(employeeId)
      .then((b) => live && setBalances(b))
      .catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [employeeId, allowed]);

  if (!allowed) return null;

  return (
    <section aria-labelledby="leave-balances-heading" className="border-t border-slate-100 pt-3 space-y-2">
      <h3 id="leave-balances-heading" className="text-xs font-bold text-slate-800">Leave balances</h3>
      {error ? (
        <p role="alert" className="text-xs text-red-700">{error}</p>
      ) : balances === null ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading leave balances">
          {[0, 1].map((i) => <div key={i} className="h-4 rounded bg-slate-100 animate-pulse motion-reduce:animate-none" />)}
        </div>
      ) : balances.length === 0 ? (
        <p className="text-xs text-slate-500">No leave balances set up for this employee yet.</p>
      ) : (
        <dl className="space-y-1.5 text-xs">
          {balances.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2">
              <dt className="text-slate-600 min-w-0 truncate">
                {b.rndtechnosoft_leave_types.leave_type_name}
                {!b.rndtechnosoft_leave_types.is_paid && <span className="ml-1 text-slate-400">(unpaid)</span>}
              </dt>
              <dd className="font-semibold text-slate-900 tabular-nums">{Number(b.balance_days)} days</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
