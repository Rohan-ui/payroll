/**
 * Mock data for frontend-only development.
 * All amounts in ₹ (whole rupees). No floats for money.
 */

import type {
  Employee,
  PayrollRun,
  ComplianceCalendarItem,
  EmployeeAttendance,
  AttendanceDay,
  AttendanceDayStatus,
} from '../types/payroll.types';

/* ── Helpers ────────────────────────────────────────────────── */
function buildAttendanceDays(year: number, month: number): AttendanceDay[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const days: AttendanceDay[] = [];

  const holidays: number[] = [2, 15]; // fixed holiday days for demo
  const pattern: AttendanceDayStatus[] = [
    'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT', 'PRESENT',
    'WEEKEND', 'WEEKEND',
  ];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isFuture = date > today;
    const dow = date.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = holidays.includes(d);

    let status: AttendanceDayStatus;
    if (isFuture) status = 'FUTURE';
    else if (isHoliday) status = 'HOLIDAY';
    else if (isWeekend) status = 'WEEKEND';
    else {
      // Sprinkle some absences/leaves for realism
      if (d === 5) status = 'PAID_LEAVE';
      else if (d === 12) status = 'HALF_DAY';
      else if (d === 18) status = 'ABSENT';
      else status = pattern[(d - 1) % 5] as AttendanceDayStatus;
    }
    days.push({ date: dateStr, status });
  }
  return days;
}

/* ── Employees ──────────────────────────────────────────────── */
export const MOCK_EMPLOYEES: Employee[] = [
  {
    id: '32ac9c95-5a82-4f6e-9cb7-bba3dd6f5c15',
    code: 'EMP140',
    name: 'Rohan Sawant',
    department: 'Department-1',
    designation: 'Designation-1',
    joiningDate: '2025-02-15',
    workState: 'Gujarat',
    workEmail: 'rohansawant2168@gmail.com',
    mobileNumber: '9723624309',
    status: 'ACTIVE',
    bank: {
      accountHolder: 'Rohan Sawant',
      bankName: 'HDFC Bank',
      branchName: 'Vapi Branch',
      accountNumberMasked: '••••••••4309',
      ifsc: 'HDFC0001234',
      isValidIfsc: true,
    },
    statutory: {
      pan: 'OOAPS4440J',
      aadhaarLast4: '4309',
      uan: '100987654321',
      pfEnrolled: true,
      pfCapAtCeiling: true,
      esiEnrolled: false,
      ptApplicable: true,
      taxRegime: 'NEW',
    },
    salary: {
      ctcAnnual: 600000,
      grossMonthly: 50000,
      basicMonthly: 20000,
      hraMonthly: 10000,
      specialAllowanceMonthly: 15150,
      conveyanceMonthly: 1600,
      medicalAllowanceMonthly: 1250,
    },
    leaveBalance: {
      earned: 18, usedEarned: 2,
      sick: 12, usedSick: 1,
      casual: 8, usedCasual: 1,
    },
    netPayTrend: [
      { month: 'Apr', net: 46200 },
      { month: 'May', net: 46200 },
      { month: 'Jun', net: 46200 },
      { month: 'Jul', net: 46200 },
      { month: 'Aug', net: 46200 },
      { month: 'Sep', net: 46200 },
    ],
    attendanceDays: buildAttendanceDays(2026, 9),
  },
];


/* ── Payroll runs ───────────────────────────────────────────── */
export const MOCK_PAYROLL_RUNS: PayrollRun[] = [
  {
    id: 'run-aug-2026',
    periodMonth: 'August 2026',
    periodCode: '2026-08',
    status: 'PAID',
    totalEmployees: 8,
    totalGross: 500500,
    totalDeductions: 62800,
    totalNetPayout: 437700,
    totalEmployerContributions: 64200,
    calculatedAt: '2026-08-28T10:00:00Z',
    approvedAt: '2026-08-29T14:30:00Z',
    paidAt: '2026-08-31T09:00:00Z',
    items: [],
    anomalies: [],
  },
  {
    id: 'run-sep-2026',
    periodMonth: 'September 2026',
    periodCode: '2026-09',
    status: 'APPROVED',
    totalEmployees: 8,
    totalGross: 500500,
    totalDeductions: 63100,
    totalNetPayout: 437400,
    totalEmployerContributions: 64200,
    calculatedAt: '2026-09-27T11:00:00Z',
    approvedAt: '2026-09-28T15:00:00Z',
    items: [],
    anomalies: [
      {
        id: 'anom-001',
        type: 'HIGH_LOP',
        severity: 'warning',
        employeeId: 'emp-006',
        employeeName: 'Vikram Patel',
        message: 'Vikram Patel has 2 days of Loss of Pay this month.',
        suggestedAction: 'Verify attendance records before finalising.',
      },
    ],
  },
  {
    id: 'run-oct-2026',
    periodMonth: 'October 2026',
    periodCode: '2026-10',
    status: 'DRAFT',
    totalEmployees: 8,
    totalGross: 0,
    totalDeductions: 0,
    totalNetPayout: 0,
    totalEmployerContributions: 0,
    items: [],
    anomalies: [
      {
        id: 'anom-002',
        type: 'NEW_JOINER',
        severity: 'info',
        employeeId: 'emp-004',
        employeeName: 'Karan Mehta',
        message: 'Karan Mehta joined on 1 Jun 2024. Confirm if pro-rata applies.',
        suggestedAction: 'Review joining date and confirm full-month payroll.',
      },
    ],
  },
];

/* ── Compliance calendar ────────────────────────────────────── */
export const MOCK_COMPLIANCE: ComplianceCalendarItem[] = [
  {
    id: 'comp-001',
    title: 'PF ECR Filing (EPFO)',
    authority: 'EPFO',
    dueDate: '2026-10-15',
    period: 'September 2026',
    status: 'PENDING',
    amount: 64200,
    filingType: 'Monthly ECR',
  },
  {
    id: 'comp-002',
    title: 'ESIC Return Filing',
    authority: 'ESIC',
    dueDate: '2026-10-21',
    period: 'September 2026',
    status: 'PENDING',
    amount: 4800,
    filingType: 'Monthly Return',
  },
  {
    id: 'comp-003',
    title: 'Maharashtra PT Payment',
    authority: 'State PT',
    dueDate: '2026-10-31',
    period: 'September 2026',
    status: 'PENDING',
    amount: 2500,
    filingType: 'Challan',
  },
  {
    id: 'comp-004',
    title: 'TDS Deposit (Salary)',
    authority: 'Income Tax',
    dueDate: '2026-10-07',
    period: 'September 2026',
    status: 'PAID',
    amount: 22400,
    filingType: 'Challan 281',
  },
  {
    id: 'comp-005',
    title: 'PF ECR Filing (EPFO)',
    authority: 'EPFO',
    dueDate: '2026-09-15',
    period: 'August 2026',
    status: 'PAID',
    amount: 64200,
    filingType: 'Monthly ECR',
  },
  {
    id: 'comp-006',
    title: 'TDS Deposit (Salary)',
    authority: 'Income Tax',
    dueDate: '2026-09-07',
    period: 'August 2026',
    status: 'OVERDUE',
    amount: 22400,
    filingType: 'Challan 281',
  },
];
