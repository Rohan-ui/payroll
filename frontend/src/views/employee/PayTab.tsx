import React, { useEffect, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { employeeProfileApi, type EmployeeProfile } from '../../api/employee-profile.api';
import { SalaryPanel } from '../payroll/SalaryPanel';
import { monthName } from '../payroll/PayrollOverviewTab';
import { day, errorText, fieldClass, money, todayIso } from '../payroll/payroll-format';
import { Facts, Field, FormDialog, Section } from './profile-ui';

interface IssuedPayslip { month: string; payslipNumber: string; gross: string; deductions: string; net: string; paymentDate: string | null }

/** Salary, bank account and payslips, each shown only to people allowed to see it. */
export const PayTab: React.FC<{ profile: EmployeeProfile; onSaved: (profile: EmployeeProfile) => void; onOpenPayslips: () => void }> = ({ profile, onSaved, onOpenPayslips }) => {
  const { can } = useAuth();
  const canSeePayslips = can('payroll.view') && can('salary.view');
  const [replacing, setReplacing] = useState(false);
  const bank = profile.bankAccount;

  return (
    <div className="space-y-4">
      {can('salary.view') && <SalaryPanel employeeId={profile.id} />}

      {profile.canSeeBankAccount && (
        <Section title="Bank account" description={bank ? `Salary paid here since ${day(bank.effectiveFrom)}` : undefined}
          action={can('people.bank.update') && <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>{bank ? 'Change account' : 'Add account'}</Button>}>
          {bank ? (
            <Facts columns={3} items={[
              { label: 'Account holder', value: bank.accountHolderName },
              { label: 'Bank', value: bank.bankName },
              { label: 'Branch', value: bank.branchName },
              { label: 'Account number', value: bank.accountNumberLast4 && <span className="font-mono">•••• {bank.accountNumberLast4}</span> },
              { label: 'IFSC', value: bank.ifsc && <span className="font-mono">{bank.ifsc}</span> },
              { label: 'Account type', value: bank.accountType && bank.accountType.charAt(0) + bank.accountType.slice(1).toLowerCase() },
            ]} />
          ) : <p className="text-sm text-slate-500">No bank account on record. Add one before this employee is paid by bank transfer.</p>}
        </Section>
      )}

      {canSeePayslips && <Payslips employeeId={profile.id} onOpenPayslips={onOpenPayslips} />}

      {!can('salary.view') && !profile.canSeeBankAccount && !canSeePayslips && (
        <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-[#2B293E]">
          You don’t have access to pay details. Ask a workspace administrator if you need them.
        </p>
      )}

      {replacing && <BankAccountDialog profile={profile} onSaved={onSaved} onClose={() => setReplacing(false)} />}
    </div>
  );
};

const Payslips: React.FC<{ employeeId: string; onOpenPayslips: () => void }> = ({ employeeId, onOpenPayslips }) => {
  const [payslips, setPayslips] = useState<IssuedPayslip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    apiClient.get<{ data: IssuedPayslip[] }>(`/payroll/employees/${employeeId}/payslips`)
      .then((r) => live && setPayslips(r.data))
      .catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [employeeId]);

  return (
    <Section title="Payslips" action={<Button variant="ghost" size="sm" onClick={onOpenPayslips}>Open Payslips</Button>}>
      {error ? <p role="alert" className="text-sm text-red-700">Payslips could not be loaded: {error}</p>
        : payslips === null ? <p className="text-sm text-slate-500">Loading payslips…</p>
        : payslips.length === 0 ? <p className="text-sm text-slate-500">No payslips yet. They’re issued when a month’s payroll is finalized.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">Issued payslips, newest first</caption>
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200 dark:border-[#2B293E]">
                  <th scope="col" className="px-2 py-2 font-bold">Month</th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">Gross</th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">Deductions</th>
                  <th scope="col" className="px-2 py-2 text-right font-bold">Net pay</th>
                  <th scope="col" className="px-2 py-2 font-bold">Paid on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E]">
                {payslips.slice(0, 12).map((p) => (
                  <tr key={p.payslipNumber}>
                    <td className="px-2 py-2.5">{monthName(p.month)} <Badge variant="success" size="sm" className="ml-1">Issued</Badge></td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{money(p.gross)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{money(p.deductions)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{money(p.net)}</td>
                    <td className="px-2 py-2.5">{p.paymentDate ? day(p.paymentDate.slice(0, 10)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Section>
  );
};

const BankAccountDialog: React.FC<{ profile: EmployeeProfile; onSaved: (profile: EmployeeProfile) => void; onClose: () => void }> = ({ profile, onSaved, onClose }) => {
  const [form, setForm] = useState({
    accountHolderName: profile.bankAccount?.accountHolderName ?? profile.personal.fullName,
    bankName: '', branchName: '', accountNumber: '', confirmAccountNumber: '', bankCode: '', accountType: 'SAVINGS', effectiveFrom: todayIso(),
  });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const submit = () => {
    const accountNumber = form.accountNumber.replace(/\s/g, '');
    if (!/^[0-9]{6,18}$/.test(accountNumber)) return Promise.reject(new Error('Account number must be 6 to 18 digits.'));
    if (accountNumber !== form.confirmAccountNumber.replace(/\s/g, '')) return Promise.reject(new Error('The two account numbers don’t match.'));
    const bankCode = form.bankCode.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bankCode)) return Promise.reject(new Error('Enter a valid IFSC code, such as HDFC0001234.'));
    return employeeProfileApi.replaceBankAccount(profile.id, {
      accountHolderName: form.accountHolderName.trim(), bankName: form.bankName.trim(), branchName: form.branchName.trim() || undefined,
      accountNumber, bankCode, accountType: form.accountType, effectiveFrom: form.effectiveFrom,
    });
  };
  return (
    <FormDialog title={profile.bankAccount ? 'Change bank account' : 'Add bank account'} size="lg" submitLabel="Save account" onSubmit={submit} onSaved={onSaved} onClose={onClose}
      description={profile.bankAccount ? `Salary goes to the new account from the date below; the account ending ${profile.bankAccount.accountNumberLast4 ?? '····'} stops the day before.` : undefined}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Account holder" required>{(a) => <input {...a} className={fieldClass} value={form.accountHolderName} onChange={set('accountHolderName')} required />}</Field>
        <Field label="Bank" required>{(a) => <input {...a} className={fieldClass} value={form.bankName} onChange={set('bankName')} required />}</Field>
        <Field label="Account number" required>{(a) => <input {...a} inputMode="numeric" autoComplete="off" className={`${fieldClass} font-mono`} value={form.accountNumber} onChange={set('accountNumber')} required />}</Field>
        <Field label="Confirm account number" required>{(a) => <input {...a} inputMode="numeric" autoComplete="off" className={`${fieldClass} font-mono`} value={form.confirmAccountNumber} onChange={set('confirmAccountNumber')} required />}</Field>
        <Field label="IFSC" required>{(a) => <input {...a} className={`${fieldClass} font-mono uppercase`} maxLength={11} value={form.bankCode} onChange={set('bankCode')} required />}</Field>
        <Field label="Branch">{(a) => <input {...a} className={fieldClass} value={form.branchName} onChange={set('branchName')} />}</Field>
        <Field label="Account type" required>
          {(a) => <select {...a} className={fieldClass} value={form.accountType} onChange={set('accountType')}><option value="SAVINGS">Savings</option><option value="SALARY">Salary</option><option value="CURRENT">Current</option></select>}
        </Field>
        <Field label="Pay into this account from" required>{(a) => <input {...a} type="date" className={fieldClass} value={form.effectiveFrom} onChange={set('effectiveFrom')} required />}</Field>
      </div>
    </FormDialog>
  );
};
