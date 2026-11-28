import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MonthSummary } from './MonthSummary';
import { MiniBars } from './MiniBars';
import type { EmployeeMonthResponse } from '../../../api/attendance.api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const day = (n: number, status: string, workedMinutes = 0) => ({ date: `2026-11-${String(n).padStart(2, '0')}`, day: n, status, workedMinutes });

describe('MonthSummary', () => {
  it('measures paid days against the days so far and splits only those days', () => {
    const days = [day(1, 'PRESENT', 480), day(2, 'PRESENT', 480), day(3, 'ABSENT'), day(4, 'WEEKEND'), day(5, 'FUTURE'), day(6, 'FUTURE')];
    const data = {
      employee: { id: 'e', employeeCode: 'E1', fullName: 'Asha', designation: 'Dev', departmentId: 'd', departmentName: 'Eng' },
      month: '2026-11', workingDays: 3, attendancePct: 67, payableDays: 3, totalWorkedHours: 16,
      stats: { presentDays: 2, absentDays: 1, lopCount: 0, halfDays: 0, leaveDays: 0, lateMarks: 0, avgCheckInTime: null, overtimeHours: 0, bestStreakDays: 2 },
      days,
    } as unknown as EmployeeMonthResponse;
    act(() => root.render(<MonthSummary data={data} />));
    expect(container.textContent).toContain('of 4 so far');
    expect(container.textContent).toContain('2 days to come');
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Days so far: 2 present, 1 absent, 1 week off');
    expect(container.querySelectorAll('[role="img"] > span')).toHaveLength(3);
  });
});

describe('MiniBars', () => {
  const days = [day(1, 'PRESENT', 600), day(2, 'FUTURE')];

  it('lets a past day be picked but not an upcoming one', () => {
    act(() => root.render(<MiniBars days={days} onSelectDay={() => undefined} />));
    const [past, future] = [...container.querySelectorAll('button')];
    expect(past.disabled).toBe(false);
    expect(future.disabled).toBe(true);
  });

  it('draws no buttons when it is only a picture', () => {
    act(() => root.render(<MiniBars days={days} />));
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
