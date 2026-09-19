import { Employee, EmployeeAttendance, EmployeePayrollItem, VariablePayrollInput } from '../types/payroll.types';

export interface StatePTSlabConfig {
  state: string;
  calculatePT: (gross: number, monthIndex?: number) => number;
}

export const STATE_PT_CONFIGS: Record<string, (gross: number, isFebruary?: boolean) => number> = {
  Maharashtra: (gross: number, isFebruary = false) => {
    if (gross <= 7500) return 0;
    if (gross <= 10000) return 175;
    return isFebruary ? 300 : 200;
  },
  Gujarat: (gross: number) => {
    if (gross < 6000) return 0;
    if (gross < 9000) return 80;
    if (gross < 12000) return 150;
    return 200;
  },
  Karnataka: (gross: number) => {
    if (gross <= 15000) return 0;
    return 200;
  },
  Delhi: () => 0, // Delhi does not levy Professional Tax
};

export interface PayrollCalcOptions {
  totalMonthDays: number;
  monthIndex?: number; // 0-11
  isFebruary?: boolean;
  enforceNewWageCode50Percent?: boolean; // New labour codes: Basic+DA >= 50% CTC
}

/**
 * Pure calculation function for an individual employee's monthly payroll
 */
export function calculateEmployeePayroll(
  emp: Employee,
  attendance: EmployeeAttendance,
  variableInput?: VariablePayrollInput,
  options: PayrollCalcOptions = { totalMonthDays: 30 },
): EmployeePayrollItem {
  const { totalMonthDays, isFebruary = false } = options;
  const payableDays = Math.max(0, Math.min(attendance.payableDays, totalMonthDays));

  // 1. Pro-rata earnings calculation
  const earnedBasic = Math.round((emp.salary.basicMonthly * payableDays) / totalMonthDays);
  const earnedHra = Math.round((emp.salary.hraMonthly * payableDays) / totalMonthDays);
  const earnedSpecial = Math.round((emp.salary.specialAllowanceMonthly * payableDays) / totalMonthDays);
  const earnedConveyance = Math.round((emp.salary.conveyanceMonthly * payableDays) / totalMonthDays);

  const bonus = variableInput?.bonus || 0;
  const overtimePay = variableInput?.overtimePay || 0;
  const reimbursement = variableInput?.reimbursement || 0;

  const grossEarnings = earnedBasic + earnedHra + earnedSpecial + earnedConveyance + bonus + overtimePay;

  // 2. EPF Calculation (Employee 12%, Employer 12% [3.67% EPF + 8.33% EPS max ₹1,250])
  let epfEmployee = 0;
  let epfEmployer = 0;
  let epsEmployer = 0;

  if (emp.statutory.pfEnrolled) {
    const pfWageBase = emp.statutory.pfCapAtCeiling
      ? Math.min(earnedBasic, 15000)
      : earnedBasic;

    epfEmployee = Math.round(pfWageBase * 0.12);

    // EPS capped at 8.33% of ₹15,000 = ₹1,250 max
    const epsBase = Math.min(earnedBasic, 15000);
    epsEmployer = Math.round(epsBase * 0.0833);
    epfEmployer = epfEmployee - epsEmployer;
  }

  // 3. ESI Calculation (Applicable only if grossMonthly <= ₹21,000)
  let esicEmployee = 0;
  let esicEmployer = 0;

  if (emp.statutory.esiEnrolled && emp.salary.grossMonthly <= 21000) {
    esicEmployee = Math.round(grossEarnings * 0.0075);
    esicEmployer = Math.round(grossEarnings * 0.0325);
  }

  // 4. Professional Tax
  let pt = 0;
  if (emp.statutory.ptApplicable) {
    const ptFn = STATE_PT_CONFIGS[emp.workState] || STATE_PT_CONFIGS['Maharashtra'];
    pt = ptFn(grossEarnings, isFebruary);
  }

  // 5. TDS Estimation (Simplified Section 192 estimate)
  let tds = 0;
  const projectedAnnualGross = grossEarnings * 12;

  if (emp.statutory.taxRegime === 'NEW') {
    // Under New Regime: ₹75,000 standard deduction, rebate under Section 87A makes tax ₹0 up to ₹7.75L
    const taxableIncome = Math.max(0, projectedAnnualGross - 75000);
    if (taxableIncome > 700000) {
      // Approximate slab for high earners: ~10% beyond 7L
      const annualTax = (taxableIncome - 700000) * 0.1;
      tds = Math.round(annualTax / 12);
    }
  } else {
    // Old Regime: ₹50,000 standard deduction
    const taxableIncome = Math.max(0, projectedAnnualGross - 50000);
    if (taxableIncome > 500000) {
      const annualTax = (taxableIncome - 500000) * 0.2;
      tds = Math.round(annualTax / 12);
    }
  }

  const otherDeductions = variableInput?.otherDeductions || 0;
  const totalDeductions = epfEmployee + esicEmployee + pt + tds + otherDeductions;
  const netPay = Math.max(0, grossEarnings - totalDeductions);

  return {
    employeeId: emp.id,
    employeeCode: emp.code,
    employeeName: emp.name,
    department: emp.department,
    designation: emp.designation,
    workState: emp.workState,
    monthDays: totalMonthDays,
    payableDays,
    lossOfPayDays: attendance.lossOfPayDays,
    earnedBasic,
    earnedHra,
    earnedSpecial,
    earnedConveyance,
    bonus,
    overtimePay,
    reimbursement,
    grossEarnings,
    epfEmployee,
    epfEmployer,
    epsEmployer,
    esicEmployee,
    esicEmployer,
    pt,
    tds,
    otherDeductions,
    totalDeductions,
    netPay,
    bankSnapshot: emp.bank,
  };
}
