import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, CreditCard,
  Edit2, Download, MoreHorizontal, Shield, Banknote,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight,
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
import { attendanceApi } from '../api/attendance.api';
import { CosecRefreshNote, useCosecRefresh } from './attendance/CosecRefresh';
import { SalaryPanel } from './payroll/SalaryPanel';
import { ReportingManagerCard } from './employee/ReportingManagerCard';
import { SignInCard } from './employee/SignInCard';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { monthName } from './payroll/PayrollOverviewTab';
import { money } from './payroll/payroll-format';

interface IssuedPayslip { month: string; payslipNumber: string; gross: string; deductions: string; net: string; paymentDate: string | null }
import type { Employee, AttendanceDay } from '../types/payroll.types';

/* ── Helpers ──────────────────────────────────────────────── */
function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function fmtDate(d?: string): string {
  if (!d) return '—';
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

const STATUS_META: Record<string, { variant: BadgeVariant; label: string }> = {
  ACTIVE:     { variant: 'success', label: 'Active' },
  active:     { variant: 'success', label: 'Active' },
  ON_NOTICE:  { variant: 'warning', label: 'On Notice' },
  on_notice:  { variant: 'warning', label: 'On Notice' },
  RESIGNED:   { variant: 'danger',  label: 'Resigned' },
  resigned:   { variant: 'danger',  label: 'Resigned' },
  PROBATION:  { variant: 'info',    label: 'Probation' },
  probation:  { variant: 'info',    label: 'Probation' },
  INACTIVE:   { variant: 'neutral', label: 'Inactive' },
  inactive:   { variant: 'neutral', label: 'Inactive' },
  TERMINATED: { variant: 'danger',  label: 'Terminated' },
  terminated: { variant: 'danger',  label: 'Terminated' },
  SUSPENDED:  { variant: 'warning', label: 'Suspended' },
  suspended:  { variant: 'warning', label: 'Suspended' },
};

/* ── Small section heading ────────────────────────────────── */
const SectionHeading: React.FC<{ icon: React.ElementType; title: string }> = ({ icon: Icon, title }) => (
  <div className="flex items-center gap-2 mb-3">
    <Icon className="w-4 h-4 text-teal-500" />
    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</h3>
  </div>
);

/* ── Info row ─────────────────────────────────────────────── */
const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start gap-2 py-2 border-b border-slate-50 dark:border-[#2B293E]/50 last:border-0">
    <span className="text-xs text-slate-400 dark:text-slate-500 w-28 shrink-0 pt-0.5">{label}</span>
    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex-1">{value}</span>
  </div>
);

/* ── Custom tooltip for chart ─────────────────────────────── */
const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[#1E1D2D] border border-slate-200 dark:border-[#2B293E] rounded-xl shadow-card px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 dark:text-white">{label}</p>
      <p className="text-teal-600 dark:text-teal-400 font-bold">{fmt(payload[0].value)}</p>
    </div>
  );
};

/* ── Main view ────────────────────────────────────────────── */
export const EmployeeDetailView: React.FC = () => {
  const { employees, selectedEmployeeId, setSelectedEmployeeId, setCurrentView } = usePayroll();

  const emp = employees.find((e) => e.id === selectedEmployeeId) ?? employees[0];

  const now = new Date();
  const liveYear = now.getFullYear();
  const liveMonth = now.getMonth() + 1; // 1-indexed

  const [selectedYear, setSelectedYear] = useState<number>(liveYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(liveMonth);
  const [liveAttendanceDays, setLiveAttendanceDays] = useState<AttendanceDay[]>([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | undefined>();
  const [isLoadingAttendance, setIsLoadingAttendance] = useState<boolean>(false);
  // Bumped when COSEC brought changes, to load the month again.
  const [attendanceReload, setAttendanceReload] = useState(0);
  // Issued payslips from finalized payroll; null while loading or without access.
  const { can } = useAuth();
  const canSeePay = can('payroll.view') && can('salary.view');
  const [payslips, setPayslips] = useState<IssuedPayslip[] | null>(null);
  useEffect(() => {
    if (!emp?.id || !canSeePay) return;
    let current = true;
    setPayslips(null);
    apiClient.get<{ data: IssuedPayslip[] }>(`/payroll/employees/${emp.id}/payslips`)
      .then((r) => { if (current) setPayslips(r.data); })
      .catch(() => { if (current) setPayslips([]); });
    return () => { current = false; };
  }, [emp?.id, canSeePay]);

  const isCurrentLiveMonth = selectedYear === liveYear && selectedMonth === liveMonth;
  const currentMonthName = new Date(selectedYear, selectedMonth - 1, 1).toLocaleString('en-IN', { month: 'long' });

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const handleResetToLiveMonth = () => {
    setSelectedYear(liveYear);
    setSelectedMonth(liveMonth);
  };

  // Fetch real attendance records for the selected employee & month
  useEffect(() => {
    if (!emp?.id) return;
    let isMounted = true;
    setIsLoadingAttendance(true);
    const monthQuery = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

    attendanceApi.getEmployeeMonth(emp.id, monthQuery)
      .then((res) => {
        if (!isMounted) return;
        if (res?.days && res.days.length > 0) {
          const mapped: AttendanceDay[] = res.days.map((d) => ({
            date: d.date,
            status: d.status as any,
            checkIn: d.firstCheckInAt || undefined,
            checkOut: d.lastCheckOutAt || undefined,
            workedHours: d.workedHours,
          }));
          setLiveAttendanceDays(mapped);
        } else {
          setLiveAttendanceDays([]);
        }
      })
      .catch((err) => {
        console.warn('Could not load live attendance for employee month:', err);
        if (isMounted) setLiveAttendanceDays([]);
      })
      .finally(() => {
        if (isMounted) setIsLoadingAttendance(false);
      });

    return () => { isMounted = false; };
  }, [emp?.id, selectedYear, selectedMonth, attendanceReload]);

  const cosecRefresh = useCosecRefresh(emp?.id, `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`, () => setAttendanceReload((n) => n + 1));

  const handleManageAttendance = (targetDate?: string) => {
    if (emp?.id) setSelectedEmployeeId(emp.id);
    const defaultDay = isCurrentLiveMonth ? String(now.getDate()).padStart(2, '0') : '01';
    const d = targetDate || `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${defaultDay}`;

    const params = new URLSearchParams(window.location.search);
    params.set('view', 'attendance');
    params.set('date', d);
    if (emp?.id) params.set('employeeId', emp.id);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);

    setCurrentView('attendance');
  };

  if (!emp) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Shield className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No employee selected</p>
        <Button variant="ghost" onClick={() => setCurrentView('people')} className="mt-4">
          Back to People
        </Button>
      </div>
    );
  }

  // Safe status determination with fallback
  const rawStatus = (emp.status || 'ACTIVE').toString();
  const upperStatus = rawStatus.toUpperCase();
  const statusMeta = STATUS_META[emp.status] || STATUS_META[upperStatus] || {
    variant: (upperStatus === 'RESIGNED' || upperStatus === 'TERMINATED'
      ? 'danger'
      : upperStatus === 'ON_NOTICE' || upperStatus === 'SUSPENDED'
      ? 'warning'
      : upperStatus === 'PROBATION'
      ? 'info'
      : upperStatus === 'INACTIVE'
      ? 'neutral'
      : 'success') as BadgeVariant,
    label: rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase().replace(/_/g, ' '),
  };

  const avatarStatus =
    upperStatus === 'ACTIVE'
      ? 'active'
      : upperStatus === 'ON_NOTICE'
      ? 'notice'
      : upperStatus === 'RESIGNED' || upperStatus === 'TERMINATED'
      ? 'resigned'
      : 'none';

  // Only what the record holds: anything not recorded says so instead of showing an invented value.
  const statutory = emp.statutory;
  const bank = emp.bank;
  const leaveBalance = emp.leaveBalance;
  const netPayTrend = [...(payslips ?? [])].reverse().map((p) => ({ month: monthName(p.month, 'short'), net: Number(p.net) }));

  const attendanceDays = Array.isArray(emp.attendanceDays) ? emp.attendanceDays : [];

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentView('people')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-600 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            aria-label="Back to People"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-slate-800 dark:text-white">{emp.name || emp.code}</h1>
              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
              {emp.isNewJoiner && <Badge variant="info">New Joiner</Badge>}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{[emp.designation, emp.department].filter(Boolean).join(' · ') || 'No designation or department set'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentView('edit-employee')}>
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setCurrentView('payslips')}>
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Payslips
          </Button>
          <button
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-[#181724] border border-slate-200 dark:border-[#2B293E] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            aria-label="More actions"
          >
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
              <Avatar
                name={emp.name || emp.code}
                size="xl"
                status={avatarStatus}
              />
              <div>
                <p className="text-base font-bold text-slate-800 dark:text-white">{emp.name || emp.code}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{emp.code}</p>
                <Badge variant={statusMeta.variant} size="sm" className="mt-1">{statusMeta.label}</Badge>
              </div>
            </div>
            <SectionHeading icon={Mail} title="Contact" />
            <InfoRow
              label="Work Email"
              value={
                emp.workEmail ? (
                  <a href={`mailto:${emp.workEmail}`} className="text-teal-600 dark:text-teal-400 hover:underline break-all">
                    {emp.workEmail}
                  </a>
                ) : '—'
              }
            />
            <InfoRow label="Mobile" value={emp.mobileNumber || '—'} />
            <InfoRow label="Work State" value={emp.workState || '—'} />
            <InfoRow label="Joining Date" value={fmtDate(emp.joiningDate)} />
            <InfoRow label="Department" value={emp.department || '—'} />
            <InfoRow label="Designation" value={emp.designation || '—'} />
          </Card>

          <ReportingManagerCard employeeId={emp.id} />
          <SignInCard employeeId={emp.id} name={emp.name || emp.code} />

          {/* Statutory card */}
          <Card>
            <SectionHeading icon={Shield} title="Statutory" />
            {!statutory ? <p className="text-xs text-slate-500 dark:text-slate-400">PAN, Aadhaar, PF and ESI details aren’t recorded for this employee yet.</p> : <>
            <InfoRow label="PAN" value={<span className="font-mono">{statutory.pan || '—'}</span>} />
            <InfoRow label="Aadhaar (last 4)" value={<span className="font-mono">XXXX XXXX {statutory.aadhaarLast4 || '••••'}</span>} />
            {statutory.uan && <InfoRow label="UAN" value={<span className="font-mono">{statutory.uan}</span>} />}
            {statutory.esicNumber && <InfoRow label="ESIC No." value={<span className="font-mono">{statutory.esicNumber}</span>} />}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {[
                { label: 'PF', enrolled: Boolean(statutory.pfEnrolled) },
                { label: 'ESI', enrolled: Boolean(statutory.esiEnrolled) },
                { label: 'PT', enrolled: Boolean(statutory.ptApplicable) },
                { label: (statutory.taxRegime || 'NEW') + ' Regime', enrolled: true },
              ].map(({ label, enrolled }) => (
                <div
                  key={label}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    enrolled
                      ? 'bg-mint-100 dark:bg-emerald-950/40 text-[#0E5A47] dark:text-emerald-300 border border-teal-200 dark:border-emerald-800/40'
                      : 'bg-slate-100 dark:bg-[#252336] text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-[#2B293E]'
                  }`}
                >
                  {enrolled
                    ? <CheckCircle2 className="w-3.5 h-3.5" />
                    : <XCircle className="w-3.5 h-3.5" />}
                  {label}
                </div>
              ))}
            </div>
            </>}
          </Card>

          {/* Bank card */}
          <Card>
            <SectionHeading icon={Banknote} title="Bank Account" />
            {!bank ? <p className="text-xs text-slate-500 dark:text-slate-400">No bank account is on record. Add one with Edit employee before paying by bank transfer.</p> : <>
            <div className="bg-gradient-to-br from-[#0E5A47] to-teal-600 rounded-2xl p-4 text-white mb-3 shadow-sm">
              <p className="text-xs text-teal-200 mb-1">{bank.bankName || 'Bank'}</p>
              <p className="text-base font-mono font-bold tracking-widest">{bank.accountNumberMasked || '••••••••'}</p>
              <p className="text-xs text-teal-200 mt-2">{bank.accountHolder || emp.name || 'Account Holder'}</p>
            </div>
            <InfoRow label="IFSC" value={<span className="font-mono">{bank.ifsc || '—'}</span>} />
            {bank.branchName && <InfoRow label="Branch" value={bank.branchName} />}
            <InfoRow
              label="IFSC Valid"
              value={
                bank.isValidIfsc
                  ? <span className="text-teal-600 dark:text-teal-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Verified</span>
                  : <span className="text-red-500 dark:text-red-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />Invalid</span>
              }
            />
            </>}
          </Card>
        </div>

        {/* ═══ Column 2 — Leave, Net Pay Trend, Calendar ═══ */}
        <div className="space-y-4">
          {/* Leave balance */}
          <Card>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Leave Balance</h3>
            {!leaveBalance ? <p className="text-xs text-slate-500 dark:text-slate-400">Leave balances aren’t set up for this employee yet.</p> : <>
            <div className="flex justify-around">
              <StatRing
                label="Earned Leave"
                total={leaveBalance.earned}
                used={leaveBalance.usedEarned}
                color="teal"
                size={88}
              />
              <StatRing
                label="Sick Leave"
                total={leaveBalance.sick}
                used={leaveBalance.usedSick}
                color="amber"
                size={88}
              />
              <StatRing
                label="Casual Leave"
                total={leaveBalance.casual}
                used={leaveBalance.usedCasual}
                color="violet"
                size={88}
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Used EL', val: leaveBalance.usedEarned },
                { label: 'Used SL', val: leaveBalance.usedSick },
                { label: 'Used CL', val: leaveBalance.usedCasual },
              ].map(({ label, val }) => (
                <div key={label} className="bg-slate-50 dark:bg-[#15141F] border border-slate-100 dark:border-[#2B293E] rounded-xl p-2">
                  <p className="text-base font-bold text-slate-700 dark:text-white">{val}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            </>}
          </Card>

          {/* Net Pay Trend */}
          <Card>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Net Pay (finalized payroll)</h3>
            {!netPayTrend.length ? <p className="text-xs text-slate-500 dark:text-slate-400">{payslips === null && canSeePay ? 'Loading…' : 'No finalized payslips yet.'}</p> : (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={netPayTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="netPayGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2FB898" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2FB898" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="net"
                  stroke="#2FB898"
                  strokeWidth={2}
                  fill="url(#netPayGrad)"
                  dot={{ fill: '#2FB898', r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </Card>

          {/* Attendance calendar */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                  Attendance — {currentMonthName} {selectedYear}
                </h3>
                {isCurrentLiveMonth && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-mint-100 dark:bg-emerald-950/70 text-[#0E5A47] dark:text-emerald-300 border border-teal-200 dark:border-emerald-800/60 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                    Live Month
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center rounded-lg border border-slate-200 dark:border-[#2B293E] bg-slate-50 dark:bg-[#15141F] p-0.5">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    title="Previous Month"
                    className="p-1 rounded hover:bg-white dark:hover:bg-[#181724] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    title="Next Month"
                    className="p-1 rounded hover:bg-white dark:hover:bg-[#181724] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {!isCurrentLiveMonth && (
                  <button
                    type="button"
                    onClick={handleResetToLiveMonth}
                    className="text-[11px] px-2 py-1 rounded bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 font-semibold transition-colors cursor-pointer"
                  >
                    Live Month
                  </button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleManageAttendance()}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:bg-mint-50 dark:hover:bg-teal-950/30"
                >
                  Manage Attendance →
                </Button>
              </div>
            </div>
            <div className="-mt-2 mb-3"><CosecRefreshNote state={cosecRefresh} /></div>
            <CalendarHeatmap
              year={selectedYear}
              month={selectedMonth}
              days={liveAttendanceDays.length > 0 ? liveAttendanceDays : attendanceDays}
              selectedDate={selectedCalendarDate}
              onDayClick={(dateStr) => {
                setSelectedCalendarDate(dateStr);
                handleManageAttendance(dateStr);
              }}
            />
          </Card>
        </div>

        {/* ═══ Column 3 — Salary, Payslip history ═══ */}
        <div className="space-y-4">
          <SalaryPanel employeeId={emp.id} />

          {/* Payslip history */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">Recent Payslips</h3>
              <button
                onClick={() => setCurrentView('payslips')}
                className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium focus-visible:outline-none"
              >
                View all
              </button>
            </div>
            <ul className="space-y-2">
              {(payslips ?? []).slice(0, 3).map((ps) => (
                <li key={ps.payslipNumber} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#15141F] border border-transparent dark:border-[#2B293E]">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{monthName(ps.month)}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">Net {money(ps.net)} · gross {money(ps.gross)}</p>
                  </div>
                  <Badge variant="success" size="sm">Payslip issued</Badge>
                </li>
              ))}
              {payslips !== null && payslips.length === 0 && (
                <li className="text-xs text-slate-400 dark:text-slate-500 text-center py-4">No payslips yet. They’re issued when a month’s payroll is finalized.</li>
              )}
              {!canSeePay && <li className="text-xs text-slate-400 text-center py-4">You don’t have access to pay details.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};
