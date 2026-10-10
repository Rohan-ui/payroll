import { describe, expect, it } from 'vitest';
import { mapBackendEmployeeToUi } from './employee-mapper.util';

describe('employee mapper', () => {
  it('keeps only what the record holds: no invented salary, bank, PAN, contact or job', () => {
    const emp = mapBackendEmployeeToUi({ id: 'e1', employee_code: 'E1', first_name: 'Asha', employee_status: 'ACTIVE' });
    expect(emp.salary).toBeUndefined();
    expect(emp.bank).toBeUndefined();
    expect(emp.statutory).toBeUndefined();
    expect(emp.leaveBalance).toBeUndefined();
    expect(emp.netPayTrend).toBeUndefined();
    expect([emp.workEmail, emp.mobileNumber, emp.department, emp.designation, emp.joiningDate]).toEqual(['', '', '', '', '']);
  });

  it('shows a bank account only when one is on record, masked from its stored last four digits', () => {
    const emp = mapBackendEmployeeToUi({
      id: 'e1', employee_code: 'E1', first_name: 'Asha',
      rndtechnosoft_employee_bank_accounts: [{ bank_name: 'State Bank of India', account_number_encrypted: 'v1:ciphertext==', account_number_last4: '7788', bank_code: 'SBIN0000300' }],
    });
    expect(emp.bank).toMatchObject({ bankName: 'State Bank of India', accountNumberMasked: '••••7788', ifsc: 'SBIN0000300', isValidIfsc: true });
  });
});
