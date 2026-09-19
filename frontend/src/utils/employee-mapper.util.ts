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

  const department =
    currentEmp.department ||
    rawEmployment.rndtechnosoft_departments?.department_name ||
    'Operations';

  const designation =
    currentEmp.designation ||
    rawEmployment.rndtechnosoft_designations?.designation_name ||
    'Specialist';

  const joiningDateRaw =
    currentEmp.joiningDate || emp.joining_date || emp.hireDate || emp.hire_date || '2026-10-01';
  const joiningDate = typeof joiningDateRaw === 'string' ? joiningDateRaw.substring(0, 10) : '2026-10-01';

  const defaultGross = 35000;
  const basicMonthly = Math.round(defaultGross * 0.5);
  const hraMonthly = Math.round(basicMonthly * 0.4);
  const specialAllowanceMonthly = defaultGross - basicMonthly - hraMonthly;

  const bankName = rawBank.bank_name || 'HDFC Bank';
  const rawAccount = rawBank.account_number_encrypted || rawBank.account_number || '50100456789123';
  const maskedAccount = rawAccount.length > 4 ? `••••${rawAccount.slice(-4)}` : '••••4321';
  const ifsc = rawBank.bank_code || 'HDFC0000240';

  return {
    id: emp.id || `emp-${empCode.toLowerCase()}`,
    code: empCode,
    name: fullName,
    department,
    designation,
    joiningDate,
    workState: 'Maharashtra',
    workEmail: emp.workEmail || emp.work_email || `${empCode.toLowerCase()}@acme.com`,
    mobileNumber: emp.workMobile || emp.work_mobile || '+91 98765 43210',
    status: (emp.employeeStatus || emp.employee_status || 'ACTIVE') as any,
    bank: {
      accountHolder: fullName,
      bankName,
      accountNumberMasked: maskedAccount,
      ifsc,
      isValidIfsc: !!(ifsc && ifsc.length === 11),
    },
    statutory: {
      pan: 'ABCDE1234F',
      aadhaarLast4: '7890',
      pfEnrolled: true,
      pfCapAtCeiling: true,
      esiEnrolled: defaultGross <= 21000,
      ptApplicable: true,
      taxRegime: 'NEW',
    },
    salary: {
      ctcAnnual: defaultGross * 12,
      grossMonthly: defaultGross,
      basicMonthly,
      hraMonthly,
      specialAllowanceMonthly,
      conveyanceMonthly: 0,
      medicalAllowanceMonthly: 0,
    },
    isNewJoiner: joiningDate.includes('2026-10'),
    leaveBalance: { earned: 18, usedEarned: 0, sick: 12, usedSick: 0, casual: 8, usedCasual: 0 },
    netPayTrend: [
      { month: 'Apr', net: 0 },
      { month: 'May', net: 0 },
      { month: 'Jun', net: 0 },
      { month: 'Jul', net: 0 },
      { month: 'Aug', net: 0 },
      { month: 'Sep', net: defaultGross },
    ],
    attendanceDays: [],
  };
}
