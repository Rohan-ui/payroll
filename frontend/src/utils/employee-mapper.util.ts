import { Employee } from '../types/payroll.types';

export function mapBackendEmployeeToUi(emp: any): Employee {
  if (!emp) {
    emp = {};
  }

  const empCode = emp.employeeCode || emp.employee_code || 'EMP001';
  const firstName = emp.firstName || emp.first_name || 'Staff';
  const middleName = emp.middleName || emp.middle_name || '';
  const lastName = emp.lastName || emp.last_name || '';

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ') || empCode;

  const currentEmp = emp.currentEmployment || {};
  const rawEmployment = (emp.rndtechnosoft_employee_employments && emp.rndtechnosoft_employee_employments[0]) || {};
  const rawBank = (emp.rndtechnosoft_employee_bank_accounts && emp.rndtechnosoft_employee_bank_accounts[0]) || {};

  // Only what the record holds: a missing value shows as not recorded, never as an invented one.
  const department = currentEmp.department || rawEmployment.rndtechnosoft_departments?.department_name || '';
  const designation = currentEmp.designation || rawEmployment.rndtechnosoft_designations?.designation_name || '';
  const joiningDateRaw = currentEmp.joiningDate || emp.joining_date || emp.hireDate || emp.hire_date || '';
  const joiningDate = typeof joiningDateRaw === 'string' ? joiningDateRaw.substring(0, 10) : '';

  // Bank details only when an account is on record, masked from its stored last four digits.
  const last4 = rawBank.account_number_last4 || '';
  const ifsc = rawBank.bank_code || '';
  const bank = rawBank.bank_name
    ? {
        accountHolder: rawBank.account_holder_name || fullName,
        bankName: rawBank.bank_name,
        branchName: rawBank.branch_name || undefined,
        accountNumberMasked: last4 ? `••••${last4}` : 'Not recorded',
        ifsc,
        isValidIfsc: /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc),
      }
    : undefined;

  return {
    id: emp.id || `emp-${empCode.toLowerCase()}`,
    code: empCode,
    name: fullName,
    department,
    designation,
    joiningDate,
    workEmail: emp.workEmail || emp.work_email || '',
    mobileNumber: emp.workMobile || emp.work_mobile || '',
    status: (() => {
      let st = String(emp.employeeStatus || emp.employee_status || 'ACTIVE').trim();
      if (st === '1' || st.toLowerCase() === 'true') return 'ACTIVE';
      if (st === '0' || st.toLowerCase() === 'false') return 'INACTIVE';
      return st.toUpperCase() as any;
    })(),
    bank,
    isNewJoiner: !!joiningDate && joiningDate.slice(0, 7) === new Date().toISOString().slice(0, 7),
    attendanceDays: [],
  };
}
