import React from 'react';
import {
  Users, IndianRupee, ShieldCheck, CalendarCheck,
  ArrowRight, AlertTriangle, CheckCircle2, Clock, TrendingUp,
} from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { StatRing } from '../components/ui/StatRing';
import { MOCK_PAYROLL_RUNS, MOCK_COMPLIANCE } from '../mock/data';

/* ── Helpers ──────────────────────────────────────────────── */
function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

const AUTHORITY_COLOR: Record<string, string> = {
  EPFO: 'info',
  ESIC: 'purple',
  'State PT': 'warning',
  'Income Tax': 'neutral',
};

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  PAID:      'success',
  PENDING:   'warning',
  OVERDUE:   'danger',
  APPROVED:  'info' as any,
  DRAFT:     'neutral',
  CALCULATED:'info' as any,
};

const RUN_STATUS_BADGE: Record<string, 'success' | 'warning' | 'neutral' | 'info'> = {
  PAID:       'success',
  APPROVED:   'info',
  DRAFT:      'neutral',
  CALCULATED: 'warning',
};

export const DashboardView: React.FC = () => {
  const { employees, payrollRun, role, setCurrentView } = usePayroll();

  const activeEmps = employees.filter((e) => e.status === 'ACTIVE').length;
  const totalNetPay = employees.reduce((s, e) => s + e.salary.grossMonthly, 0);
  const pfLiability = employees.reduce(
    (s, e) => s + (e.statutory.pfEnrolled ? Math.round(Math.min(e.salary.basicMonthly, e.statutory.pfCapAtCeiling ? 15000 : e.salary.basicMonthly) * 0.12) : 0),
    0,
  );
  const pendingLeaves = employees.reduce(
    (s, e) => s + Math.max(0, (e.leaveBalance?.usedEarned ?? 0) > (e.leaveBalance?.earned ?? 0) ? 1 : 0),
    0,
  );

  const upcomingCompliance = MOCK_COMPLIANCE.filter((c) => c.status === 'PENDING').slice(0, 4);
  const overdueCompliance = MOCK_COMPLIANCE.filter((c) => c.status === 'OVERDUE');
  const recentRuns = MOCK_PAYROLL_RUNS.slice(0, 3);

  /* Employee view */
  if (role === 'EMPLOYEE') {
    const me = employees[0];
    return (
      <div className="space-y-5 max-w-xl">
        <div>
          <h1 className="text-xl font-bold text-slate-800">My Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">September 2026</p>
        </div>

        {/* Net pay card */}
        <Card highlight className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">September Net Pay</p>
            <p className="text-3xl font-bold text-[#0E5A47]">
              {me ? fmt(me.salary.grossMonthly * 0.84) : '₹—'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Credited on 30 Sep</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCurrentView('payslips')}>
            View Payslip
          </Button>
        </Card>

        {/* Leave rings */}
        {me && (
          <Card>
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Leave Balance</h2>
            <div className="flex justify-around">
              <StatRing label="Earned Leave" total={me.leaveBalance.earned} used={me.leaveBalance.usedEarned} color="teal" />
              <StatRing label="Sick Leave"   total={me.leaveBalance.sick}   used={me.leaveBalance.usedSick}   color="amber" />
              <StatRing label="Casual Leave" total={me.leaveBalance.casual} used={me.leaveBalance.usedCasual} color="violet" />
            </div>
          </Card>
        )}

        {/* Attendance card */}
        <Card className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">My Attendance & Shifts</p>
              <p className="text-xs text-slate-400">View daily clock-in records & calendar</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCurrentView('attendance')}>
            View Attendance
          </Button>
        </Card>

        {/* Download payslip */}
        <Button variant="ghost" onClick={() => setCurrentView('payslips')} className="gap-2">
          <IndianRupee className="w-4 h-4" /> View all payslips
        </Button>
      </div>
    );
  }

  /* Admin / HR view */
  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Financial Year 2026–27 · October 2026</p>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Employees', value: String(activeEmps), icon: Users,        color: 'text-teal-600',      bg: 'bg-teal-50' },
          { label: 'Monthly Payout',  value: fmt(totalNetPay),  icon: IndianRupee,   color: 'text-[#0E5A47]',     bg: 'bg-mint-100' },
          { label: 'PF Liability',    value: fmt(pfLiability),  icon: ShieldCheck,   color: 'text-amber-600',     bg: 'bg-amber-50' },
          { label: 'Pending Leaves',  value: String(pendingLeaves), icon: CalendarCheck, color: 'text-slate-600',  bg: 'bg-slate-100' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 truncate">{label}</p>
              <p className="text-lg font-bold text-slate-800 leading-tight">{value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Run Payroll CTA ── */}
      <div
        className="bg-[#0E5A47] rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:bg-[#0A4537] transition-colors"
        onClick={() => setCurrentView('payroll')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setCurrentView('payroll')}
        aria-label="Run Payroll for October 2026"
      >
        <div>
          <p className="text-teal-200 text-xs font-semibold uppercase tracking-wider mb-1">October 2026 Payroll</p>
          <p className="text-white text-xl font-bold">Run Payroll for October 2026</p>
          <p className="text-teal-200 text-sm mt-1">
            {activeEmps} employees · {fmt(totalNetPay)} estimated payout
          </p>
        </div>
        <button className="shrink-0 flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
          Start Payroll <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── 2-column: Compliance + Payroll history ── */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Compliance calendar */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-800">Upcoming Compliance</h2>
            <button onClick={() => setCurrentView('settings')} className="text-xs text-teal-600 hover:underline font-medium">
              View all
            </button>
          </div>
          {overdueCompliance.length > 0 && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {overdueCompliance.length} overdue filing{overdueCompliance.length > 1 ? 's' : ''} — take action immediately.
            </div>
          )}
          <ul className="space-y-2.5">
            {upcomingCompliance.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{item.title}</p>
                  <p className="text-[10px] text-slate-400">{item.dueDate} · {item.period}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={AUTHORITY_COLOR[item.authority] as any} size="sm">{item.authority}</Badge>
                  {item.amount && <span className="text-[10px] text-slate-500">{fmt(item.amount)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* Payroll run history */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-800">Recent Payroll Runs</h2>
            <button onClick={() => setCurrentView('payroll')} className="text-xs text-teal-600 hover:underline font-medium">
              Run payroll
            </button>
          </div>
          <ul className="space-y-3">
            {recentRuns.map((run) => (
              <li key={run.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  {run.status === 'PAID' ? (
                    <CheckCircle2 className="w-4 h-4 text-teal-500" />
                  ) : (
                    <TrendingUp className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700">{run.periodMonth}</p>
                  <p className="text-[10px] text-slate-400">{run.totalEmployees} employees</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-slate-800">{run.totalNetPayout > 0 ? fmt(run.totalNetPayout) : '—'}</p>
                  <Badge variant={RUN_STATUS_BADGE[run.status]} size="sm">{run.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ── Today's attendance exceptions ── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800">Attendance Exceptions Today</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentView('attendance')}
            className="text-xs text-teal-600 hover:text-teal-700 font-semibold"
          >
            Manage Attendance & Shifts →
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          {employees.filter((e) => e.status === 'ACTIVE').slice(0, 6).map((emp) => (
            <div key={emp.id} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
              <Avatar name={emp.name} size="sm" status={emp.status === 'ACTIVE' ? 'active' : 'resigned'} />
              <div>
                <p className="text-xs font-semibold text-slate-700">{emp.name.split(' ')[0]}</p>
                <p className="text-[10px] text-slate-400">{emp.department}</p>
              </div>
            </div>
          ))}
          {employees.length === 0 && (
            <p className="text-sm text-slate-400">No attendance exceptions today.</p>
          )}
        </div>
      </Card>
    </div>
  );
};
