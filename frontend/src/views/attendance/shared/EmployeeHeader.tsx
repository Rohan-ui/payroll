import React from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import type { EmployeeMonthResponse } from '../../../api/attendance.api';

/** Who this attendance belongs to, with room for the view's one action on the right. */
export const EmployeeHeader: React.FC<{ employee: EmployeeMonthResponse['employee']; action?: React.ReactNode }> = ({ employee, action }) => (
  <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div className="flex items-center gap-4 min-w-0">
      <Avatar name={employee.fullName} size="lg" />
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-slate-900 truncate">{employee.fullName}</h2>
        <p className="text-xs text-slate-500 mt-0.5 truncate">
          {[employee.employeeCode, employee.designation, employee.departmentName].filter(Boolean).join(' · ')}
        </p>
        {employee.email && <p className="text-xs text-slate-400 truncate">{employee.email}</p>}
      </div>
    </div>
    {action}
  </div>
);
