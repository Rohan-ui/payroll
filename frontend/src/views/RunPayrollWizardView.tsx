import React, { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { usePayroll } from '../context/PayrollContext';
import { formatINR, numberToWordsINR } from '../utils/currency.util';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmployeePayrollItem } from '../types/payroll.types';
import {
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  X,
  Download,
  Lock,
} from 'lucide-react';

export const RunPayrollWizardView: React.FC = () => {
  const { t } = useI18n();
  const {
    payrollRun,
    attendanceMap,
    updateAttendance,
    markAllPresent,
    calculateCurrentPayroll,
    approveCurrentPayroll,
    wizardStep,
    setWizardStep,
    setCurrentView,
    isLoading,
  } = usePayroll();

  const [selectedItemForDrawer, setSelectedItemForDrawer] = useState<EmployeePayrollItem | null>(null);

  const steps = [
    { num: 1, title: 'Attendance & LOP' },
    { num: 2, title: 'Earnings & Deductions' },
    { num: 3, title: 'Anomalies & Diff' },
    { num: 4, title: 'Approve & Pay' },
    { num: 5, title: 'Payslips & Bank Advice' },
  ];

  const handleNext = async () => {
    if (wizardStep === 1) {
      await calculateCurrentPayroll();
    }
    if (wizardStep === 4) {
      await approveCurrentPayroll();
    }
    if (wizardStep < 5) {
      setWizardStep(wizardStep + 1);
    }
  };

  const handleBack = () => {
    if (wizardStep > 1) {
      setWizardStep(wizardStep - 1);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Wizard Header & Stepper */}
      <div className="bg-white dark:bg-[#181724] border border-slate-100 dark:border-[#2B293E] rounded-3xl p-6 sm:p-8 shadow-card">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-500/20">
                Monthly Processing
              </span>
              <Badge variant={payrollRun.status === 'APPROVED' ? 'success' : 'neutral'} size="sm">
                {payrollRun.status}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Run Payroll for {payrollRun.periodMonth}
            </h1>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Calculated Net Payout</p>
            <p className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
              {formatINR(payrollRun.totalNetPayout)}
            </p>
          </div>
        </div>

        {/* 5-Step Stepper */}
        <div className="grid grid-cols-5 gap-2 border-t border-slate-100 dark:border-[#2B293E] pt-5">
          {steps.map((s) => {
            const isCompleted = wizardStep > s.num;
            const isCurrent = wizardStep === s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => setWizardStep(s.num)}
                className="text-left group focus:outline-none"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isCompleted
                        ? 'bg-emerald-700 text-white'
                        : isCurrent
                        ? 'bg-teal-500 text-white'
                        : 'bg-slate-100 dark:bg-[#252336] text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-[#2E2B42]'
                    }`}
                  >
                    {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : s.num}
                  </div>
                  <span
                    className={`text-xs font-bold hidden sm:inline truncate ${
                      isCurrent
                        ? 'text-teal-700 dark:text-teal-400'
                        : isCompleted
                        ? 'text-teal-600 dark:text-teal-500'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
                <div
                  className={`h-1 rounded-full w-full transition-all ${
                    isCompleted ? 'bg-teal-500' : isCurrent ? 'bg-teal-400' : 'bg-slate-100 dark:bg-[#252336]'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 1: ATTENDANCE & LOSS OF PAY (LOP) */}
      {wizardStep === 1 && (
        <Card
          title="Step 1: Attendance & Loss of Pay (LOP) Verification"
          subtitle="Confirm days worked, paid leaves, and unapproved absences for October (31 days)."
          action={
            <Button variant="secondary" size="sm" onClick={markAllPresent}>
              Mark All Present (0 LOP)
            </Button>
          }
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-[#2B293E]">
            <table className="w-full text-left text-sm divide-y divide-slate-200/80 dark:divide-[#2B293E]">
              <thead className="bg-slate-50 dark:bg-[#1E1D2D] font-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Total Days</th>
                  <th className="py-3 px-4">Present Days</th>
                  <th className="py-3 px-4">Loss of Pay (LOP)</th>
                  <th className="py-3 px-4">Payable Days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E] bg-white dark:bg-[#181724]">
                {payrollRun.items.map((item) => {
                  const att = attendanceMap[item.employeeId] || {
                    monthDays: 31,
                    presentDays: 27,
                    paidLeaveDays: 4,
                    lossOfPayDays: 0,
                    payableDays: 31,
                  };
                  return (
                    <tr key={item.employeeId} className="hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900 dark:text-white">{item.employeeName}</p>
                        <p className="text-xs text-slate-400 font-mono">{item.employeeCode} • {item.department}</p>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700 dark:text-slate-300">{att.monthDays}</td>
                      <td className="py-3.5 px-4 font-mono font-medium text-emerald-700 dark:text-emerald-400">{att.presentDays}</td>
                      <td className="py-3.5 px-4">
                        <input
                          type="number"
                          min="0"
                          max="31"
                          value={att.lossOfPayDays}
                          onChange={(e) => updateAttendance(item.employeeId, parseInt(e.target.value) || 0)}
                          className="w-20 px-3 py-1.5 border border-slate-300 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] text-slate-800 dark:text-white rounded-xl text-sm font-mono font-bold focus:border-teal-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">{att.payableDays}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}      {/* STEP 2: EARNINGS & DEDUCTIONS */}
      {wizardStep === 2 && (
        <Card
          title="Step 2: Gross Earnings & Statutory Deductions Register"
          subtitle="Click on any employee to inspect the complete gross-to-net calculation breakdown."
        >
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-[#2B293E]">
            <table className="w-full text-left text-sm divide-y divide-slate-200/80 dark:divide-[#2B293E]">
              <thead className="bg-slate-50 dark:bg-[#1E1D2D] font-bold text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4 text-right">Earned Gross</th>
                  <th className="py-3 px-4 text-right">EPF (12%)</th>
                  <th className="py-3 px-4 text-right">ESIC</th>
                  <th className="py-3 px-4 text-right">PT</th>
                  <th className="py-3 px-4 text-right">TDS</th>
                  <th className="py-3 px-4 text-right">Net Take-Home</th>
                  <th className="py-3 px-4 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2B293E] bg-white dark:bg-[#181724]">
                {payrollRun.items.map((item) => (
                  <tr key={item.employeeId} className="hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors">
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900 dark:text-white">{item.employeeName}</p>
                      <p className="text-xs text-slate-400 font-mono">{item.employeeCode}</p>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                      {formatINR(item.grossEarnings)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                      {formatINR(item.epfEmployee)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                      {item.esicEmployee > 0 ? formatINR(item.esicEmployee) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                      {formatINR(item.pt)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-300">
                      {item.tds > 0 ? formatINR(item.tds) : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      {formatINR(item.netPay)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedItemForDrawer(item)}
                        className="text-xs font-bold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-[#252336] hover:bg-slate-200 dark:hover:bg-[#2E2B42] px-3 py-1 rounded-lg transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* STEP 3: ANOMALIES & DIFF */}
      {wizardStep === 3 && (
        <Card
          title="Step 3: Verification Checks & Anomalies"
          subtitle="Automated checks detecting pro-rata joiners, LOP spikes & bank details."
        >
          {payrollRun.anomalies.length === 0 ? (
            <div className="p-10 text-center text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Zero Payroll Blockers Detected</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                All employee bank details, statutory exemptions, and attendance registers are clean.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {payrollRun.anomalies.map((anom) => (
                <div
                  key={anom.id}
                  className={`p-4 rounded-2xl border flex items-start justify-between gap-4 ${
                    anom.severity === 'critical'
                      ? 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200'
                      : anom.severity === 'warning'
                      ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200'
                      : 'bg-slate-50 dark:bg-[#1E1D2D] border-slate-200 dark:border-[#2B293E] text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{anom.employeeName}</span>
                        <Badge
                          variant={anom.severity === 'critical' ? 'danger' : 'warning'}
                          size="sm"
                        >
                          {anom.type}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1">{anom.message}</p>
                      <p className="text-xs font-semibold mt-0.5 opacity-80">
                        Action: {anom.suggestedAction}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* STEP 4: APPROVE & PAY */}
      {wizardStep === 4 && (
        <Card
          title="Step 4: Final Sign-off & Lock Payroll"
          subtitle="Audit-locked sign-off in compliance with the Indian Code on Wages."
        >
          <div className="bg-slate-50 dark:bg-[#1E1D2D] border border-slate-200/80 dark:border-[#2B293E] rounded-2xl p-6 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Payroll Period</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{payrollRun.periodMonth}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">1st Oct - 31st Oct 2026</p>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Headcount</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">{payrollRun.totalEmployees} Employees</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">100% attendance verified</p>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Net Disbursement</p>
                <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
                  {formatINR(payrollRun.totalNetPayout)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{numberToWordsINR(payrollRun.totalNetPayout)}</p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/40 rounded-xl text-xs text-amber-900 dark:text-amber-300 flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Audit Safety Guarantee:</strong> Once approved and finalized, payslips and line items are locked to preserve historical payroll reproducibility.
            </span>
          </div>
        </Card>
      )}

      {/* STEP 5: PAYSLIPS & BANK ADVICE */}
      {wizardStep === 5 && (
        <Card
          title="Step 5: Generated Payslips & Corporate Bank Transfer File"
          subtitle="Download bank CMS file for HDFC/ICICI/SBI, EPFO ECR text format, and employee payslips."
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-slate-50/60 dark:bg-[#1E1D2D] hover:bg-white dark:hover:bg-[#252336] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-[#252336] text-slate-800 dark:text-white flex items-center justify-center font-bold mb-3">
                🏦
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">NEFT / RTGS Bank File</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">Standard 14-column CMS format for bulk upload.</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-white dark:bg-[#181724]"
                icon={<Download className="w-4 h-4" />}
                onClick={() => {
                  const headers = 'Bene_Name,Bene_Account,IFSC,Amount,Remarks\n';
                  const rows = payrollRun.items
                    .map((i) => `"${i.employeeName}","${i.bankSnapshot.accountNumberMasked}","${i.bankSnapshot.ifsc}",${i.netPay},"SALARY_OCT_2026"`)
                    .join('\n');
                  const blob = new Blob([headers + rows], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `BANK_TRANSFER_CMS_OCT_2026.csv`;
                  a.click();
                }}
              >
                Download CMS CSV
              </Button>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-slate-50/60 dark:bg-[#1E1D2D] hover:bg-white dark:hover:bg-[#252336] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-[#252336] text-slate-800 dark:text-white flex items-center justify-center font-bold mb-3">
                ⚖️
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">EPFO ECR Text File</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">Direct upload to EPFO Unified Employer Portal.</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-white dark:bg-[#181724]"
                icon={<Download className="w-4 h-4" />}
                onClick={() => alert('Exporting EPFO Unified Portal Electronic Challan (ECR)...')}
              >
                Export ECR File
              </Button>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-slate-50/60 dark:bg-[#1E1D2D] hover:bg-white dark:hover:bg-[#252336] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-[#252336] text-slate-800 dark:text-white flex items-center justify-center font-bold mb-3">
                📄
              </div>
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">Official Payslip Register</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">Full company register with digital QR verification.</p>
              <Button
                variant="primary"
                size="sm"
                className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold"
                onClick={() => setCurrentView('payslips')}
              >
                Open Payslips View
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Navigation Footer Controls */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200/80 dark:border-[#2B293E]">
        <Button
          variant="outline"
          disabled={wizardStep === 1}
          onClick={handleBack}
          icon={<ArrowLeft className="w-4 h-4" />}
        >
          Previous Step
        </Button>

        {wizardStep < 5 ? (
          <Button
            variant="primary"
            size="lg"
            className="bg-teal-500 hover:bg-teal-600 text-white font-bold px-6"
            onClick={handleNext}
            disabled={isLoading}
          >
            {wizardStep === 4 ? 'Approve & Lock Payroll' : 'Save & Continue'}
            <ArrowRight className="w-5 h-5 ml-1" />
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="bg-teal-500 hover:bg-teal-600 text-white font-bold px-6"
            onClick={() => setCurrentView('dashboard')}
          >
            Finish &amp; Return to Dashboard
          </Button>
        )}
      </div>

      {/* Slide-over Inspection Drawer */}
      {selectedItemForDrawer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-lg bg-white dark:bg-[#181724] h-full shadow-2xl p-6 sm:p-8 overflow-y-auto flex flex-col justify-between border-l border-slate-200 dark:border-[#2B293E]">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-[#2B293E] mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedItemForDrawer.employeeName}</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {selectedItemForDrawer.employeeCode} • {selectedItemForDrawer.designation}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItemForDrawer(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Earnings Breakdown */}
              <div className="space-y-4 mb-6">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Earnings Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[#2B293E]">
                    <span className="text-slate-600 dark:text-slate-300">Basic Wage (50% rule)</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{formatINR(selectedItemForDrawer.earnedBasic)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[#2B293E]">
                    <span className="text-slate-600 dark:text-slate-300">House Rent Allowance (HRA)</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{formatINR(selectedItemForDrawer.earnedHra)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[#2B293E]">
                    <span className="text-slate-600 dark:text-slate-300">Special Allowance</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{formatINR(selectedItemForDrawer.earnedSpecial)}</span>
                  </div>
                  <div className="flex justify-between py-2 bg-slate-50 dark:bg-[#1E1D2D] px-3 rounded-lg font-bold">
                    <span className="text-slate-800 dark:text-slate-200">Total Gross Earnings</span>
                    <span className="font-mono text-slate-900 dark:text-white">{formatINR(selectedItemForDrawer.grossEarnings)}</span>
                  </div>
                </div>
              </div>

              {/* Statutory Deductions */}
              <div className="space-y-4 mb-6">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Statutory Deductions</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[#2B293E]">
                    <span className="text-slate-600 dark:text-slate-300">EPF Employee Contribution (12%)</span>
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-400">{formatINR(selectedItemForDrawer.epfEmployee)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[#2B293E]">
                    <span className="text-slate-600 dark:text-slate-300">Health Insurance (ESIC 0.75%)</span>
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-400">{formatINR(selectedItemForDrawer.esicEmployee)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[#2B293E]">
                    <span className="text-slate-600 dark:text-slate-300">State Professional Tax (PT)</span>
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-400">{formatINR(selectedItemForDrawer.pt)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-[#2B293E]">
                    <span className="text-slate-600 dark:text-slate-300">TDS (Section 192)</span>
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-400">{formatINR(selectedItemForDrawer.tds)}</span>
                  </div>
                </div>
              </div>

              {/* Net Payout */}
              <div className="p-4 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-2xl text-center">
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">Net Take-Home Pay</p>
                <p className="text-3xl font-black text-emerald-800 dark:text-emerald-300 font-mono mt-1">
                  {formatINR(selectedItemForDrawer.netPay)}
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              className="w-full mt-6"
              onClick={() => setSelectedItemForDrawer(null)}
            >
              Close Drawer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
