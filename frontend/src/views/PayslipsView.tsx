import React, { useState } from 'react';
import { Download, FileText, X, IndianRupee } from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { MOCK_PAYROLL_RUNS } from '../mock/data';
import type { EmployeePayrollItem } from '../types/payroll.types';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

/* ── Payslip modal ─────────────────────────────────────────── */
const PayslipModal: React.FC<{
  item: EmployeePayrollItem;
  period: string;
  onClose: () => void;
}> = ({ item, period, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
    <div className="w-full max-w-lg bg-white dark:bg-[#181724] border border-slate-100 dark:border-[#2B293E] rounded-3xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-[#2B293E] bg-[#0E5A47] text-white">
        <div>
          <p className="text-xs text-teal-200">Payslip · {period}</p>
          <p className="font-bold">{item.employeeName}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-6 py-5 overflow-y-auto max-h-[70vh]">
        <div className="flex justify-between mb-5 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <p>Employee Code: <strong className="text-slate-800 dark:text-white">{item.employeeCode}</strong></p>
            <p>Department: <strong className="text-slate-800 dark:text-white">{item.department}</strong></p>
            <p>Designation: <strong className="text-slate-800 dark:text-white">{item.designation}</strong></p>
          </div>
          <div className="text-right">
            <p>Payable Days: <strong className="text-slate-800 dark:text-white">{item.payableDays}</strong></p>
            <p>LOP Days: <strong className="text-slate-800 dark:text-white">{item.lossOfPayDays}</strong></p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Earnings */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Earnings</p>
            {[
              { l: 'Basic', v: item.earnedBasic },
              { l: 'HRA', v: item.earnedHra },
              { l: 'Special Allowance', v: item.earnedSpecial },
              { l: 'Conveyance', v: item.earnedConveyance },
              { l: 'Bonus', v: item.bonus },
              { l: 'Overtime', v: item.overtimePay },
              { l: 'Reimbursement', v: item.reimbursement },
            ].filter(r => r.v > 0).map(({ l, v }) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-slate-50 dark:border-[#2B293E] text-xs">
                <span className="text-slate-600">{l}</span>
                <span className="font-mono text-slate-700">{fmt(v)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 mt-1 text-xs font-bold">
              <span className="text-slate-800">Gross Earnings</span>
              <span className="font-mono text-[#0E5A47]">{fmt(item.grossEarnings)}</span>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Deductions</p>
            {[
              { l: 'EPF (Employee 12%)', v: item.epfEmployee },
              { l: 'ESIC (Employee 0.75%)', v: item.esicEmployee },
              { l: 'Prof. Tax', v: item.pt },
              { l: 'TDS', v: item.tds },
              { l: 'Other Deductions', v: item.otherDeductions },
            ].filter(r => r.v > 0).map(({ l, v }) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-slate-50 text-xs">
                <span className="text-slate-600">{l}</span>
                <span className="font-mono text-red-600">−{fmt(v)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 mt-1 text-xs font-bold">
              <span className="text-slate-800">Total Deductions</span>
              <span className="font-mono text-red-600">−{fmt(item.totalDeductions)}</span>
            </div>
          </div>
        </div>

        {/* Net pay */}
        <div className="mt-4 bg-mint-100 rounded-2xl px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-bold text-[#0E5A47]">Net Pay</p>
          <p className="text-2xl font-bold text-[#0E5A47]">{fmt(item.netPay)}</p>
        </div>

        {/* Employer contributions */}
        <div className="mt-4 text-xs text-slate-400">
          <p className="font-semibold text-slate-500 mb-1">Employer Contributions (not deducted from salary)</p>
          <div className="flex gap-4">
            <span>EPF: {fmt(item.epfEmployer)}</span>
            <span>EPS: {fmt(item.epsEmployer)}</span>
            {item.esicEmployer > 0 && <span>ESIC: {fmt(item.esicEmployer)}</span>}
          </div>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-slate-100 flex gap-3 no-print">
        <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
        <Button variant="primary" className="flex-1 gap-2" onClick={() => window.print()}>
          <Download className="w-4 h-4" /> Download PDF
        </Button>
      </div>
    </div>
  </div>
);

/* ── Main view ─────────────────────────────────────────────── */
export const PayslipsView: React.FC = () => {
  const { employees, payrollRun, role } = usePayroll();
  const [modalItem, setModalItem] = useState<{ item: EmployeePayrollItem; period: string } | null>(null);
  const [selectedEmpId, setSelectedEmpId] = useState(employees[0]?.id ?? '');

  const selectedEmp = employees.find((e) => e.id === selectedEmpId) ?? employees[0];

  // For employee role — show only own payslips using netPayTrend
  const isEmployee = role === 'EMPLOYEE';

  const runs = [
    ...MOCK_PAYROLL_RUNS.filter((r) => r.status === 'PAID' || r.status === 'APPROVED'),
    ...(payrollRun.status === 'CALCULATED' || payrollRun.status === 'APPROVED' || payrollRun.status === 'PAID' ? [payrollRun] : []),
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Payslips</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Download and view payslips</p>
      </div>

      {!isEmployee && (
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Employee selector */}
          <div className="lg:w-64 shrink-0">
            <Card padded={false}>
              <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2B293E]">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Select Employee</p>
              </div>
              <ul className="divide-y divide-slate-50 dark:divide-[#2B293E] max-h-96 overflow-y-auto">
                {employees.map((emp) => (
                  <li key={emp.id}>
                    <button
                      onClick={() => setSelectedEmpId(emp.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 ${
                        selectedEmpId === emp.id
                          ? 'bg-mint-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                          : 'hover:bg-slate-50 dark:hover:bg-[#1E1D2D]'
                      }`}
                    >
                      <Avatar name={emp.name} size="sm" status="active" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{emp.name}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-400">{emp.code}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Payslip history */}
          <div className="flex-1 space-y-3">
            <Card>
              <div className="flex items-center gap-3 mb-5">
                {selectedEmp && <Avatar name={selectedEmp.name} size="md" status="active" />}
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{selectedEmp?.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selectedEmp?.designation} · {selectedEmp?.code}</p>
                </div>
              </div>
              {runs.length === 0 ? (
                <div className="text-center py-10">
                  <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No payslips available</p>
                  <p className="text-xs text-slate-400">Run and approve payroll to generate payslips</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {runs.map((run) => {
                    const item = run.items.find((i) => i.employeeId === selectedEmp?.id) ?? run.items[0];
                    if (!item) return null;
                    return (
                      <li key={run.id} className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-[#1E1D2D] hover:bg-slate-100 dark:hover:bg-[#252336] transition-colors border border-transparent dark:border-[#2B293E]/60">
                        <div className="w-9 h-9 rounded-xl bg-white dark:bg-[#252336] border border-slate-200 dark:border-[#2B293E] flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-teal-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white">{run.periodMonth}</p>
                          <p className="text-xs text-slate-400">Net Pay: <strong className="text-slate-700 dark:text-slate-200">{fmt(item.netPay)}</strong></p>
                        </div>
                        <Badge variant={run.status === 'PAID' ? 'success' : 'warning'}>
                          {run.status}
                        </Badge>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setModalItem({ item, period: run.periodMonth })}
                          className="gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" /> View
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Employee self-service view */}
      {isEmployee && selectedEmp && (
        <div className="space-y-4 max-w-lg">
          <Card highlight>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-mint-100 flex items-center justify-center">
                <IndianRupee className="w-5 h-5 text-[#0E5A47]" />
              </div>
              <div>
                <p className="text-xs text-slate-500">September 2026 · Net Pay</p>
                <p className="text-2xl font-bold text-[#0E5A47]">
                  {selectedEmp.netPayTrend[5]?.net ? fmt(selectedEmp.netPayTrend[5].net) : '—'}
                </p>
              </div>
            </div>
            <Button variant="primary" size="sm" className="gap-2">
              <Download className="w-3.5 h-3.5" /> Download Payslip
            </Button>
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-4">Payslip History</h3>
            <ul className="space-y-2">
              {selectedEmp.netPayTrend.map((pt, i) => (
                <li key={i} className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{pt.month} 2026</p>
                    <p className="text-xs text-slate-400">{pt.net > 0 ? 'Credited' : 'No record'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {pt.net > 0 && (
                      <>
                        <span className="text-sm font-bold text-slate-800">{fmt(pt.net)}</span>
                        <Badge variant="success" size="sm">Paid</Badge>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {modalItem && (
        <PayslipModal
          item={modalItem.item}
          period={modalItem.period}
          onClose={() => setModalItem(null)}
        />
      )}
    </div>
  );
};
