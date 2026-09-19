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
  const { employees, setCurrentView, setSelectedEmployeeId, isLoading } = usePayroll();
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('All');

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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">People</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} of {employees.length} employees</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setCurrentView('add-employee')}
          className="gap-2 self-start sm:self-auto shadow-sm"
        >
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
          <p className="text-xs text-slate-400 mt-1 mb-4">
            {employees.length === 0
              ? 'Get started by creating your first employee profile.'
              : 'Try adjusting your search or filter'}
          </p>
          {employees.length === 0 && (
            <Button
              variant="primary"
              onClick={() => setCurrentView('add-employee')}
              className="gap-2 mx-auto"
            >
              <UserPlus className="w-4 h-4" /> Add Employee
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((emp) => (
            <Card
              key={emp.id}
              padded={false}
              onClick={() => handleRowClick(emp)}
              className="p-4 flex items-center gap-3 hover:border-teal-200 transition-colors cursor-pointer"
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
    </div>
  );
};


