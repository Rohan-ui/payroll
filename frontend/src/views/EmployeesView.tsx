import React, { useState } from 'react';
import { Search, Plus, Filter, ChevronRight, UserPlus, Users } from 'lucide-react';
import { usePayroll } from '../context/PayrollContext';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import type { Employee } from '../types/payroll.types';

const STATUS_VARIANT: Record<Employee['status'], 'success' | 'warning' | 'danger'> = {
  ACTIVE:    'success',
  ON_NOTICE: 'warning',
  RESIGNED:  'danger',
};

const STATUS_LABEL: Record<Employee['status'], string> = {
  ACTIVE:    'Active',
  ON_NOTICE: 'On Notice',
  RESIGNED:  'Resigned',
};

const DEPARTMENTS = ['All', 'Engineering', 'Sales', 'HR', 'Operations'];

export const EmployeesView: React.FC = () => {
  const { employees, setCurrentView, setSelectedEmployeeId, addEmployee, isLoading } = usePayroll();
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);

  // Add employee form state
  const [form, setForm] = useState({
    code: '', name: '', department: 'Engineering', designation: '',
    workEmail: '', mobileNumber: '', joiningDate: '',
    grossSalary: '', bankName: '', accountNumber: '', ifsc: '',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = employees.filter((e) => {
    const matchSearch =
      !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.code.toLowerCase().includes(search.toLowerCase()) ||
      e.designation.toLowerCase().includes(search.toLowerCase());
    const matchDept = dept === 'All' || e.department === dept;
    return matchSearch && matchDept;
  });

  const handleRowClick = (emp: Employee) => {
    setSelectedEmployeeId(emp.id);
    setCurrentView('employee-detail');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.workEmail) {
      setFormError('Name and work email are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await addEmployee({
        code: form.code,
        name: form.name,
        department: form.department,
        designation: form.designation,
        workEmail: form.workEmail,
        mobileNumber: form.mobileNumber,
        joiningDate: form.joiningDate || new Date().toISOString().split('T')[0],
        bank: { bankName: form.bankName, ifsc: form.ifsc, accountNumberMasked: form.accountNumber, accountHolder: form.name, isValidIfsc: !!form.ifsc },
      });
      setShowAddModal(false);
      setForm({ code: '', name: '', department: 'Engineering', designation: '', workEmail: '', mobileNumber: '', joiningDate: '', grossSalary: '', bankName: '', accountNumber: '', ifsc: '' });
    } catch {
      setFormError('Failed to add employee. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">People</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} of {employees.length} employees</p>
        </div>
        <Button variant="primary" onClick={() => setShowAddModal(true)} className="gap-2 self-start sm:self-auto">
          <UserPlus className="w-4 h-4" /> Add Employee
        </Button>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search by name, code or designation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            aria-label="Search employees"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            aria-label="Filter by department"
          >
            {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      {/* Employee list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-[3px] border-teal-100 border-t-teal-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-16">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">No employees found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filter</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((emp) => (
            <Card
              key={emp.id}
              padded={false}
              onClick={() => handleRowClick(emp)}
              className="p-4 flex items-center gap-3 hover:border-teal-200 transition-colors"
            >
              <Avatar
                name={emp.name}
                size="lg"
                status={emp.status === 'ACTIVE' ? 'active' : emp.status === 'ON_NOTICE' ? 'notice' : 'resigned'}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{emp.name}</p>
                  <Badge variant={STATUS_VARIANT[emp.status]} size="sm">{STATUS_LABEL[emp.status]}</Badge>
                </div>
                <p className="text-xs text-slate-500 truncate mt-0.5">{emp.designation}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="neutral" size="sm">{emp.department}</Badge>
                  <span className="text-[10px] text-slate-400">{emp.code}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </Card>
          ))}
        </div>
      )}

      {/* ── Add Employee Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Add New Employee</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-lg"
                aria-label="Close"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4 overflow-y-auto max-h-[70vh]">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-xs">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Employee Code</label>
                  <input className={inputClass} placeholder="RND009" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
                  <input className={inputClass} placeholder="Priya Sharma" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
                  <select className={inputClass} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                    {['Engineering', 'Sales', 'HR', 'Operations', 'Finance', 'Marketing'].map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Designation</label>
                  <input className={inputClass} placeholder="Senior Engineer" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Work Email *</label>
                <input className={inputClass} type="email" placeholder="priya@company.in" required value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Mobile</label>
                  <input className={inputClass} placeholder="9876543210" value={form.mobileNumber} onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Joining Date</label>
                  <input className={inputClass} type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Bank Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Bank Name</label>
                    <input className={inputClass} placeholder="HDFC Bank" value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">IFSC Code</label>
                    <input className={`${inputClass} font-mono`} placeholder="HDFC0001234" value={form.ifsc} onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Account Number</label>
                  <input className={`${inputClass} font-mono`} placeholder="50100123456789" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3 pt-2 sticky bottom-0 bg-white pb-1">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)} className="flex-1">Cancel</Button>
                <Button type="submit" variant="primary" loading={saving} className="flex-1">Add Employee</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


