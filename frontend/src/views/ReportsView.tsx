import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Receipt, CreditCard, BookOpen, ClipboardList } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MOCK_COMPLIANCE } from '../mock/data';

function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

const REPORT_CARDS = [
  {
    id: 'payroll-register',
    title: 'Payroll Register',
    desc: 'Full month-wise earnings, deductions and net pay for all employees.',
    icon: ClipboardList,
    badge: 'EPFO/IT',
    available: true,
  },
  {
    id: 'pf-ecr',
    title: 'PF ECR (EPFO)',
    desc: 'Electronic Challan-cum-Return for EPF monthly filing.',
    icon: FileSpreadsheet,
    badge: 'EPFO',
    available: true,
  },
  {
    id: 'esic-return',
    title: 'ESIC Monthly Return',
    desc: 'Employee and employer ESIC contribution statement.',
    icon: FileText,
    badge: 'ESIC',
    available: true,
  },
  {
    id: 'pt-challan',
    title: 'PT Challan',
    desc: 'Professional Tax challan for state filing (MH, KA, GJ, etc.).',
    icon: Receipt,
    badge: 'State PT',
    available: true,
  },
  {
    id: 'form16',
    title: 'Form 16 (Annual)',
    desc: 'TDS certificate for employees — downloadable after FY end.',
    icon: BookOpen,
    badge: 'Income Tax',
    available: false,
  },
  {
    id: 'bank-advice',
    title: 'Bank Advice / NEFT',
    desc: 'Bank payment advice file for salary credit via NEFT/RTGS.',
    icon: CreditCard,
    badge: 'Payment',
    available: true,
  },
];

const AUTHORITY_BADGE: Record<string, 'info' | 'purple' | 'warning' | 'neutral' | 'success'> = {
  'EPFO':        'info',
  'ESIC':        'purple',
  'State PT':    'warning',
  'Income Tax':  'neutral',
  'EPFO/IT':     'info',
  'Payment':     'success',
};

const STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning'> = {
  PAID:    'success',
  OVERDUE: 'danger',
  PENDING: 'warning',
};

export const ReportsView: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [period, setPeriod] = useState('2026-09');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Statutory compliance & payroll reports</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="period-select" className="text-xs font-semibold text-slate-500">Period</label>
          <select
            id="period-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            {['2026-10', '2026-09', '2026-08', '2026-07', '2026-06'].map((m) => (
              <option key={m} value={m}>{new Date(m + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Report cards grid */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {REPORT_CARDS.map(({ id, title, desc, icon: Icon, badge, available }) => (
          <Card key={id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-teal-600" />
              </div>
              <Badge variant={AUTHORITY_BADGE[badge] ?? 'neutral'} size="sm">{badge}</Badge>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">{title}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
            </div>
            <Button
              variant={available ? 'secondary' : 'outline'}
              size="sm"
              className="gap-2 self-start"
              disabled={!available}
              onClick={() => alert(`Downloading ${title} for ${period}…`)}
            >
              <Download className="w-3.5 h-3.5" />
              {available ? 'Download' : 'Available after FY end'}
            </Button>
          </Card>
        ))}
      </div>

      {/* Compliance calendar section */}
      <div>
        <h2 className="text-base font-bold text-slate-800 mb-3">Compliance Tracker</h2>
        <Card padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" role="table" aria-label="Compliance calendar">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Filing', 'Authority', 'Period', 'Due Date', 'Amount', 'Status'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {MOCK_COMPLIANCE.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-700">{item.title}</td>
                    <td className="px-4 py-3">
                      <Badge variant={AUTHORITY_BADGE[item.authority] ?? 'neutral'} size="sm">{item.authority}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{item.period}</td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{item.dueDate}</td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{item.amount ? fmt(item.amount) : '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[item.status]}>{item.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};
