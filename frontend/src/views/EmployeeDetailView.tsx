import React from 'react';
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, CreditCard,
  Edit2, Download, MoreHorizontal, Shield, Banknote,
  CheckCircle2, XCircle,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { usePayroll } from '../context/PayrollContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { StatRing } from '../components/ui/StatRing';
import { CalendarHeatmap } from '../components/ui/CalendarHeatmap';
import type { Employee } from '../types/payroll.types';

/* ── Helpers ──────────────────────────────────────────────── */
function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_META: Record<Employee['status'], { variant: 'success' | 'warning' | 'danger'; label: string }> = {
  ACTIVE:    { variant: 'success', label: 'Active' },
  ON_NOTICE: { variant: 'warning', label: 'On Notice' },
  RESIGNED:  { variant: 'danger',  label: 'Resigned' },
};

/* ── Small section heading ────────────────────────────────── */
const SectionHeading: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
  <div className="flex items-center gap-2 mb-3">
    <Icon className="w-4 h-4 text-teal-500" />
    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h3>
  </div>
);

/* ── Info row ─────────────────────────────────────────────── */
const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start gap-2 py-2 border-b border-slate-50 last:border-0">
    <span className="text-xs text-slate-400 w-28 shrink-0 pt-0.5">{label}</span>
    <span className="text-xs font-semibold text-slate-700 flex-1">{value}</span>
  </div>
);

/* ── Salary row ───────────────────────────────────────────── */
const SalaryRow: React.FC<{ label: string; amount: number; highlight?: boolean }> = ({ label, amount, highlight }) => (
  <div className={`flex justify-between items-center py-2 border-b border-slate-50 last:border-0 ${highlight ? 'font-bold' : ''}`}>
    <span className={`text-xs ${highlight ? 'text-slate-800' : 'text-slate-500'}`}>{label}</span>
    <span className={`text-xs font-mono ${highlight ? 'text-[#0E5A47] text-sm' : 'text-slate-700'}`}>{fmt(amount)}</span>
  </div>
);

/* ── Custom tooltip for chart ─────────────────────────────── */
const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-card px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700">{label}</p>
      <p className="text-teal-600 font-bold">{fmt(payload[0].value)}</p>
    </div>
  );
};

/* ── Main view ────────────────────────────────────────────── */
export const EmployeeDetailView: React.FC = () => {
  const { employees, selectedEmployeeId, setCurrentView } = usePayroll();

  const emp = employees.find((e) => e.id === selectedEmployeeId) ?? employees[0];

  if (!emp) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Shield className="w-10 h-10 text-slate-300 mb-3" />
        <p className="text-sm font-semibold text-slate-500">No employee selected</p>
        <Button variant="ghost" onClick={() => setCurrentView('people')} className="mt-4">
          Back to People
        </Button>
      </div>
    );
  }

  const statusMeta = STATUS_META[emp.status];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Payslip history derived from netPayTrend
  const payslipHistory = [...emp.netPayTrend].reverse().slice(0, 3).map((pt, i) => ({
    month: pt.month + ' 2026',
    net: pt.net,
    status: i === 0 ? 'PROCESSING' : 'PAID' as 'PAID' | 'PROCESSING',
  }));

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentView('people')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            aria-label="Back to People"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-slate-800">{emp.name}</h1>
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              {emp.isNewJoiner && <Badge variant="info">New Joiner</Badge>}
            </div>
            <p className="text-sm text-slate-500">{emp.designation} · {emp.department}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCurrentView('payslips')}>
            <Download className="w-3.5 h-3.5" /> Payslip
          </Button>
          <button className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-700 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── 3-column grid (desktop) / stacked (mobile) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ═══ Column 1 — Profile, Statutory, Bank ═══ */}
        <div className="space-y-4">
          {/* Profile card */}
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <Avatar name={emp.name} size="xl"
                status={emp.status === 'ACTIVE' ? 'active' : emp.status === 'ON_NOTICE' ? 'notice' : 'resigned'}
              />
              <div>
                <p className="text-base font-bold text-slate-800">{emp.name}</p>
                <p className="text-xs text-slate-500">{emp.code}</p>
                <Badge variant={statusMeta.variant} size="sm" className="mt-1">{statusMeta.label}</Badge>
              </div>
            </div>
            <SectionHeading icon={Mail} title="Contact" />
            <InfoRow label="Work Email" value={<a href={`mailto:${emp.workEmail}`} className="text-teal-600 hover:underline break-all">{emp.workEmail}</a>} />
            <InfoRow label="Mobile" value={emp.mobileNumber} />
            <InfoRow label="Work State" value={emp.workState} />
            <InfoRow label="Joining Date" value={fmtDate(emp.joiningDate)} />
            <InfoRow label="Department" value={emp.department} />
            <InfoRow label="Designation" value={emp.designation} />
          </Card>

          {/* Statutory card */}
          <Card>
            <SectionHeading icon={Shield} title="Statutory" />
            <InfoRow label="PAN" value={<span className="font-mono">{emp.statutory.pan}</span>} />
            <InfoRow label="Aadhaar (last 4)" value={<span className="font-mono">XXXX XXXX {emp.statutory.aadhaarLast4}</span>} />
            {emp.statutory.uan && <InfoRow label="UAN" value={<span className="font-mono">{emp.statutory.uan}</span>} />}
            {emp.statutory.esicNumber && <InfoRow label="ESIC No." value={<span className="font-mono">{emp.statutory.esicNumber}</span>} />}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { label: 'PF', enrolled: emp.statutory.pfEnrolled },
                { label: 'ESI', enrolled: emp.statutory.esiEnrolled },
                { label: 'PT', enrolled: emp.statutory.ptApplicable },
                { label: emp.statutory.taxRegime + ' Regime', enrolled: true },
              ].map(({ label, enrolled }) => (
                <div key={label} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${enrolled ? 'bg-mint-100 text-[#0E5A47]' : 'bg-slate-100 text-slate-400'}`}>
                  {enrolled
                    ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : <XCircle className="w-3.5 h-3.5" />}
                  {label}
                </div>
              ))}
            </div>
          </Card>

          {/* Bank card */}
          <Card>
            <SectionHeading icon={Banknote} title="Bank Account" />
            <div className="bg-gradient-to-br from-[#0E5A47] to-teal-600 rounded-2xl p-4 text-white mb-3">
              <p className="text-xs text-teal-200 mb-1">{emp.bank.bankName}</p>
              <p className="text-base font-mono font-bold tracking-widest">{emp.bank.accountNumberMasked}</p>
              <p className="text-xs text-teal-200 mt-2">{emp.bank.accountHolder}</p>
            </div>
            <InfoRow label="IFSC" value={<span className="font-mono">{emp.bank.ifsc}</span>} />
            {emp.bank.branchName && <InfoRow label="Branch" value={emp.bank.branchName} />}
            <InfoRow
              label="IFSC Valid"
              value={
                emp.bank.isValidIfsc
                  ? <span className="text-teal-600 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Verified</span>
                  : <span className="text-red-500 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Invalid</span>
              }
            />
          </Card>
        </div>

        {/* ═══ Column 2 — Leave, Net Pay Trend, Calendar ═══ */}
        <div className="space-y-4">
          {/* Leave balance */}
          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-4">Leave Balance — FY 2026-27</h3>
            <div className="flex justify-around">
              <StatRing
                label="Earned Leave"
                total={emp.leaveBalance.earned}
                used={emp.leaveBalance.usedEarned}
                color="teal"
                size={88}
              />
              <StatRing
                label="Sick Leave"
                total={emp.leaveBalance.sick}
                used={emp.leaveBalance.usedSick}
                color="amber"
                size={88}
              />
              <StatRing
                label="Casual Leave"
                total={emp.leaveBalance.casual}
                used={emp.leaveBalance.usedCasual}
                color="violet"
                size={88}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Used EL', val: emp.leaveBalance.usedEarned },
                { label: 'Used SL', val: emp.leaveBalance.usedSick },
                { label: 'Used CL', val: emp.leaveBalance.usedCasual },
              ].map(({ label, val }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-2">
                  <p className="text-base font-bold text-slate-700">{val}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Net Pay Trend */}
          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-4">Net Pay Trend (6 months)</h3>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={emp.netPayTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="netPayGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2FB898" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2FB898" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="net" stroke="#2FB898" strokeWidth={2}
                  fill="url(#netPayGrad)" dot={{ fill: '#2FB898', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Attendance calendar */}
          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-4">
              Attendance — {now.toLocaleString('en-IN', { month: 'long' })} {year}
            </h3>
            <CalendarHeatmap year={year} month={month} days={emp.attendanceDays} />
          </Card>
        </div>

        {/* ═══ Column 3 — Salary, Payslip history ═══ */}
        <div className="space-y-4">
          {/* Salary breakdown */}
          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-1">Salary Breakdown</h3>
            <p className="text-xs text-slate-400 mb-4">Monthly structure</p>
            {/* CTC badge */}
            <div className="bg-mint-100 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-slate-500 font-medium">Annual CTC</p>
                <p className="text-lg font-bold text-[#0E5A47]">{fmt(emp.salary.ctcAnnual)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-medium">Gross Monthly</p>
                <p className="text-base font-bold text-[#0E5A47]">{fmt(emp.salary.grossMonthly)}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Earnings</p>
              <SalaryRow label="Basic" amount={emp.salary.basicMonthly} />
              <SalaryRow label="HRA" amount={emp.salary.hraMonthly} />
              <SalaryRow label="Special Allowance" amount={emp.salary.specialAllowanceMonthly} />
              <SalaryRow label="Conveyance" amount={emp.salary.conveyanceMonthly} />
              <SalaryRow label="Medical Allowance" amount={emp.salary.medicalAllowanceMonthly} />
              <div className="mt-2 pt-2 border-t border-slate-200">
                <SalaryRow label="Gross Monthly" amount={emp.salary.grossMonthly} highlight />
              </div>
            </div>
          </Card>

          {/* Payslip history */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800">Recent Payslips</h3>
              <button
                onClick={() => setCurrentView('payslips')}
                className="text-xs text-teal-600 hover:underline font-medium focus-visible:outline-none"
              >
                View all
              </button>
            </div>
            <ul className="space-y-2">
              {payslipHistory.map((ps, i) => (
                <li key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    <Download className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{ps.month}</p>
                    <p className="text-[10px] text-slate-400">Net {fmt(ps.net)}</p>
                  </div>
                  <Badge variant={ps.status === 'PAID' ? 'success' : 'warning'} size="sm">
                    {ps.status === 'PAID' ? 'Paid' : 'Processing'}
                  </Badge>
                </li>
              ))}
              {payslipHistory.filter((p) => p.net === 0).length === payslipHistory.length && (
                <li className="text-xs text-slate-400 text-center py-4">
                  No payslips generated yet. Run payroll first.
                </li>
              )}
            </ul>
          </Card>

          {/* Employer contributions summary */}
          <Card>
            <h3 className="text-sm font-bold text-slate-800 mb-3">Employer Costs (Monthly)</h3>
            <SalaryRow label="EPF (Employer 12%)" amount={Math.round(Math.min(emp.salary.basicMonthly, emp.statutory.pfCapAtCeiling ? 15000 : emp.salary.basicMonthly) * 0.0833)} />
            <SalaryRow label="EPS (Employer 8.33%)" amount={Math.round(Math.min(emp.salary.basicMonthly, emp.statutory.pfCapAtCeiling ? 15000 : emp.salary.basicMonthly) * 0.0367)} />
            {emp.statutory.esiEnrolled && (
              <SalaryRow label="ESIC (Employer 3.25%)" amount={Math.round(emp.salary.grossMonthly * 0.0325)} />
            )}
            <div className="mt-2 pt-2 border-t border-slate-200">
              <SalaryRow
                label="Total Cost to Company"
                amount={emp.salary.grossMonthly + Math.round(Math.min(emp.salary.basicMonthly, 15000) * 0.12) + (emp.statutory.esiEnrolled ? Math.round(emp.salary.grossMonthly * 0.0325) : 0)}
                highlight
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
