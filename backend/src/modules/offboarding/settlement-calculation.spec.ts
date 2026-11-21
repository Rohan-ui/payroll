import { calculateSettlement, DEFAULT_SETTLEMENT_POLICY, serviceLength, settlementPolicy, settlementTotals, SettlementInputs } from './settlement-calculation';

const base: SettlementInputs = {
  separationType: 'RESIGNATION',
  joiningDate: '2019-01-01',
  lastWorkingDate: '2025-08-31',
  monthlySalary: { gross: '60000', components: { BASIC: '26000', DA: '0', HRA: '13000' } },
  notice: { shortfallDays: 0, decision: null },
  leave: [{ leaveTypeId: 'el', name: 'Earned leave', balanceDays: '10.5', encashable: true, asOf: '2025-08-31' }, { leaveTypeId: 'sl', name: 'Sick leave', balanceDays: '4', encashable: false, asOf: '2025-08-31' }],
  loans: [],
  assetRecoveries: [],
  assetsOut: 0,
  finalPayslip: { periodCode: '2025-08', gross: '60000', net: '52000' },
};
const line = (r: ReturnType<typeof calculateSettlement>, code: string) => r.lines.find((l) => l.code === code);

describe('full and final settlement calculation', () => {
  it('counts service in whole months, the last day included', () => {
    expect(serviceLength('2020-01-15', '2025-01-14')).toEqual({ years: 5, months: 0 });
    expect(serviceLength('2020-01-15', '2025-01-13')).toEqual({ years: 4, months: 11 });
    expect(serviceLength('2019-01-01', '2025-08-31')).toEqual({ years: 6, months: 8 });
  });

  it('pays gratuity on Basic + DA × 15/26 per year, rounding 6+ months up, only after 5 completed years', () => {
    const r = calculateSettlement(base, DEFAULT_SETTLEMENT_POLICY);
    // 6 years 8 months counts as 7: 26000 × 15 ÷ 26 × 7 = 105000
    expect(line(r, 'GRATUITY')?.amount.toFixed(2)).toBe('105000.00');
    const short = calculateSettlement({ ...base, joiningDate: '2021-03-01' }, DEFAULT_SETTLEMENT_POLICY);
    expect(line(short, 'GRATUITY')).toMatchObject({ basis: expect.objectContaining({ eligible: false }) });
    expect(line(short, 'GRATUITY')?.amount.toFixed(2)).toBe('0.00');
  });

  it('caps gratuity at the statutory limit', () => {
    const r = calculateSettlement({ ...base, joiningDate: '1990-01-01', monthlySalary: { gross: '900000', components: { BASIC: '500000' } } }, DEFAULT_SETTLEMENT_POLICY);
    expect(line(r, 'GRATUITY')).toMatchObject({ basis: expect.objectContaining({ cappedAt: '2000000' }) });
    expect(line(r, 'GRATUITY')?.amount.toFixed(2)).toBe('2000000.00');
  });

  it('encashes only encashable leave, on Basic ÷ 26, rounding once', () => {
    const r = calculateSettlement(base, DEFAULT_SETTLEMENT_POLICY);
    const encash = r.lines.filter((l) => l.code === 'LEAVE_ENCASHMENT');
    expect(encash).toHaveLength(1);
    // 26000 ÷ 26 × 10.5 = 10500
    expect(encash[0].amount.toFixed(2)).toBe('10500.00');
  });

  it('recovers a resignation’s notice shortfall on Gross ÷ 30, and pays it when the company ended the employment', () => {
    const notice = { shortfallDays: 15, decision: 'RECOVER' as const };
    expect(line(calculateSettlement({ ...base, notice }, DEFAULT_SETTLEMENT_POLICY), 'NOTICE_RECOVERY')?.amount.toFixed(2)).toBe('30000.00');
    const terminated = calculateSettlement({ ...base, separationType: 'TERMINATION', notice }, DEFAULT_SETTLEMENT_POLICY);
    expect(line(terminated, 'NOTICE_PAY')).toMatchObject({ kind: 'EARNING' });
    expect(line(calculateSettlement({ ...base, notice: { shortfallDays: 15, decision: 'WAIVE' } }, DEFAULT_SETTLEMENT_POLICY), 'NOTICE_RECOVERY')?.amount.toFixed(2)).toBe('0.00');
    expect(calculateSettlement({ ...base, notice: { shortfallDays: 15, decision: null } }, DEFAULT_SETTLEMENT_POLICY).problems.join(' ')).toMatch(/recovered or waived/);
  });

  it('never counts the payroll-paid final salary, and asks for payroll to be finalized first', () => {
    const r = calculateSettlement({ ...base, loans: [{ loanId: 'l', number: 'L-1', type: 'LOAN', outstanding: '5000', installmentIds: ['i'] }] }, DEFAULT_SETTLEMENT_POLICY);
    const totals = settlementTotals(r.lines.map((l) => ({ kind: l.kind, amount: l.amount, countsInTotal: l.countsInTotal })));
    // 10500 encashment + 105000 gratuity − 5000 loan
    expect([totals.earnings.toFixed(2), totals.recoveries.toFixed(2), totals.net.toFixed(2)]).toEqual(['115500.00', '5000.00', '110500.00']);
    expect(calculateSettlement({ ...base, finalPayslip: null }, DEFAULT_SETTLEMENT_POLICY).problems.join(' ')).toMatch(/Finalize payroll for 2025-08/);
  });

  it('recovers lost or damaged assets, and waits for every asset to be returned', () => {
    const r = calculateSettlement({ ...base, assetRecoveries: [{ assetId: 'a', name: 'Dell Latitude', tag: 'LT-7', status: 'LOST', amount: '45000.50' }] }, DEFAULT_SETTLEMENT_POLICY);
    expect(line(r, 'ASSET_RECOVERY')).toMatchObject({ kind: 'RECOVERY', label: 'Asset recovery: Dell Latitude (LT-7)', countsInTotal: true });
    expect(line(r, 'ASSET_RECOVERY')?.amount.toFixed(2)).toBe('45000.50');
    expect(r.problems).toEqual([]);
    expect(calculateSettlement({ ...base, assetsOut: 2 }, DEFAULT_SETTLEMENT_POLICY).problems.join(' ')).toMatch(/2 company assets are not returned/);
  });

  it('fills in whatever a workspace did not set from the defaults', () => {
    expect(settlementPolicy({ gratuity: { enabled: false } }).gratuity).toMatchObject({ enabled: false, minimumYears: 5 });
    expect(settlementPolicy(null)).toEqual(DEFAULT_SETTLEMENT_POLICY);
  });
});
