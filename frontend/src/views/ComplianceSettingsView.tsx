import React, { useState } from 'react';
import { Settings, Shield, Building2, IndianRupee, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { MOCK_COMPLIANCE } from '../mock/data';

type Tab = 'components' | 'compliance' | 'org';

const SALARY_COMPONENTS = [
  { code: 'BASIC',    name: 'Basic Salary',          type: 'PERCENTAGE', value: '40%', taxable: true,  statutory: true },
  { code: 'HRA',      name: 'House Rent Allowance',  type: 'PERCENTAGE', value: '20%', taxable: true,  statutory: false },
  { code: 'SPECIAL',  name: 'Special Allowance',      type: 'FORMULA',    value: 'Gross − Basic − HRA − Conv − Med', taxable: true, statutory: false },
  { code: 'CONV',     name: 'Conveyance Allowance',   type: 'FIXED',      value: '₹1,600', taxable: false, statutory: false },
  { code: 'MED',      name: 'Medical Allowance',      type: 'FIXED',      value: '₹1,250', taxable: false, statutory: false },
  { code: 'EPF_EMP',  name: 'EPF (Employee 12%)',     type: 'SYSTEM',     value: '12% of Basic', taxable: false, statutory: true },
  { code: 'ESIC_EMP', name: 'ESIC (Employee 0.75%)',  type: 'SYSTEM',     value: '0.75% of Gross', taxable: false, statutory: true },
  { code: 'PT',       name: 'Professional Tax',        type: 'SYSTEM',     value: 'State slab',  taxable: false, statutory: true },
];

const TYPE_BADGE: Record<string, 'info' | 'warning' | 'neutral' | 'purple'> = {
  PERCENTAGE: 'info',
  FORMULA:    'purple',
  FIXED:      'neutral',
  SYSTEM:     'warning',
};

function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

const STATUS_BADGE: Record<string, 'success' | 'danger' | 'warning'> = {
  PAID: 'success', OVERDUE: 'danger', PENDING: 'warning',
};

export const ComplianceSettingsView: React.FC = () => {
  const [tab, setTab] = useState<Tab>('compliance');
  const [pfCeiling, setPfCeiling] = useState(true);
  const [esicEnabled, setEsicEnabled] = useState(true);
  const [ptEnabled, setPtEnabled] = useState(true);
  const [tdsEnabled, setTdsEnabled] = useState(true);

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'compliance', label: 'Compliance',         icon: Shield },
    { id: 'components', label: 'Salary Components',  icon: IndianRupee },
    { id: 'org',        label: 'Organisation',        icon: Building2 },
  ];

  const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void; label: string; desc: string }> = ({ value, onChange, label, desc }) => (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-slate-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 shrink-0 ${value ? 'bg-teal-500' : 'bg-slate-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${value ? 'translate-x-4' : ''}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Compliance configuration and salary components</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 max-w-sm">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
              tab === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Compliance tab ── */}
      {tab === 'compliance' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Card>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Statutory Deduction Settings</h2>
            <Toggle
              value={pfCeiling}
              onChange={setPfCeiling}
              label="PF Wage Ceiling (₹15,000)"
              desc="Cap EPF contribution on ₹15,000 basic instead of actual basic salary."
            />
            <Toggle
              value={esicEnabled}
              onChange={setEsicEnabled}
              label="ESIC Applicable"
              desc="Apply ESIC for employees with gross ≤ ₹21,000/month. Employee 0.75%, Employer 3.25%."
            />
            <Toggle
              value={ptEnabled}
              onChange={setPtEnabled}
              label="Professional Tax"
              desc="Deduct PT as per state slab (Maharashtra, Karnataka, Gujarat, etc.)."
            />
            <Toggle
              value={tdsEnabled}
              onChange={setTdsEnabled}
              label="TDS Deduction"
              desc="Compute and deduct TDS (Section 192) based on employee's declared tax regime."
            />
            <div className="mt-4">
              <Button variant="primary" size="sm">Save Settings</Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Upcoming Compliance Dues</h2>
            <ul className="space-y-3">
              {MOCK_COMPLIANCE.map((item) => (
                <li key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                  {item.status === 'PAID' ? (
                    <CheckCircle2 className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className={`w-4 h-4 mt-0.5 shrink-0 ${item.status === 'OVERDUE' ? 'text-red-500' : 'text-amber-500'}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{item.title}</p>
                    <p className="text-[10px] text-slate-400">{item.period} · Due {item.dueDate}</p>
                    {item.amount && <p className="text-[10px] text-slate-500 mt-0.5">{fmt(item.amount)}</p>}
                  </div>
                  <Badge variant={STATUS_BADGE[item.status]} size="sm">{item.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* ── Salary components tab ── */}
      {tab === 'components' && (
        <Card padded={false}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-800">Salary Components</h2>
            <Button variant="secondary" size="sm" className="gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Add Component
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" aria-label="Salary components">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Code', 'Name', 'Type', 'Value / Formula', 'Taxable', 'Statutory'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {SALARY_COMPONENTS.map((c) => (
                  <tr key={c.code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-teal-700">{c.code}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{c.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={TYPE_BADGE[c.type]} size="sm">{c.type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{c.value}</td>
                    <td className="px-4 py-3">
                      {c.taxable
                        ? <CheckCircle2 className="w-4 h-4 text-teal-500" />
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {c.statutory
                        ? <Badge variant="warning" size="sm">Statutory</Badge>
                        : <span className="text-slate-300 text-[10px]">Custom</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Organisation tab ── */}
      {tab === 'org' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <Card>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Company Information</h2>
            <div className="space-y-3">
              {[
                { label: 'Company Name', value: 'RND Technosoft Pvt Ltd' },
                { label: 'PAN (Company)', value: 'AAACR1234E' },
                { label: 'TAN', value: 'MUMR12345F' },
                { label: 'EPFO Code', value: 'MH/BAN/0012345' },
                { label: 'ESIC Code', value: '31-00-012345-000' },
                { label: 'State', value: 'Maharashtra' },
                { label: 'Payroll Period', value: '1st – Last of month' },
                { label: 'Payment Day', value: 'Last working day' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-slate-50 last:border-0 text-xs">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-semibold text-slate-700 text-right">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings className="w-3.5 h-3.5" /> Edit Organisation
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-slate-800 mb-4">Financial Year</h2>
            <p className="text-xs text-slate-500 mb-3">Indian financial year runs April to March.</p>
            {[
              { label: 'Current FY', value: '2026–27' },
              { label: 'FY Start', value: '1 April 2026' },
              { label: 'FY End', value: '31 March 2027' },
              { label: 'TDS Deadline', value: '31 July 2027 (ITR)' },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-2 border-b border-slate-50 last:border-0 text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="font-semibold text-slate-700">{value}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
};
