import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DayDetail } from './DayDetail';
import { LiveTimes } from './LiveTimes';
import type { EmployeeMonthDayRecord } from '../../../api/attendance.api';

/** Time still running today counts up from the computer's clock, to the second. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ist = (time: string) => `2026-10-10T${time}+05:30`;

const day = (extra: Partial<EmployeeMonthDayRecord> = {}): EmployeeMonthDayRecord => ({
  date: '2026-10-10', day: 10, weekday: 'Sat', status: 'PRESENT', glyph: '✓', firstCheckInAt: ist('09:30:00'), lastCheckOutAt: null,
  workedMinutes: 0, workedHours: 0, lateMinutes: 0, overtimeMinutes: 0, isLate: false, source: 'COSEC_SYNC',
  shift: { name: 'General', scheduledCode: null, workingCode: null, startTime: '09:30', endTime: '18:30', graceMinutes: 10, standardMinutes: 480, breakMinutes: 60 },
  punches: [{ id: 'p1', punchAt: ist('09:30:00'), punchType: 'IN', source: 'COSEC_SYNC' }],
  ...extra,
} as EmployeeMonthDayRecord);

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(ist('11:15:20')));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

describe('live attendance time', () => {
  it('counts a check-in still open today up every second', () => {
    act(() => root.render(<DayDetail dayRecord={day()} displayMode="panel" />));
    expect(container.textContent).toContain('1h 45m 20s');
    expect(container.textContent).toContain('LIVE');
    expect(container.textContent).toContain('09:30:00 AM');
    act(() => { vi.advanceTimersByTime(2000); });
    expect(container.textContent).toContain('1h 45m 22s');
    expect(container.textContent).toContain('Inside for 1h 45m 22s');
  });

  it('stops at the check-out and shows exact session lengths', () => {
    act(() => root.render(<DayDetail dayRecord={day({
      lastCheckOutAt: ist('10:45:09'),
      punches: [{ id: 'p1', punchAt: ist('09:30:00'), punchType: 'IN', source: 'COSEC_SYNC' }, { id: 'p2', punchAt: ist('10:45:09'), punchType: 'OUT', source: 'COSEC_SYNC' }],
    } as Partial<EmployeeMonthDayRecord>)} displayMode="panel" />));
    expect(container.textContent).toContain('1h 15m 09s');
    expect(container.textContent).not.toContain('LIVE');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(container.textContent).toContain('1h 15m 09s');
  });

  it('shows an open day from an earlier date as a missing check-out, not running time', () => {
    act(() => root.render(<LiveTimes firstCheckInAt="2026-10-09T09:30:00+05:30" lastCheckOutAt={null} now={Date.now()} />));
    expect(container.textContent).toBe('09:30:00 AM – no check-out');
  });
});
