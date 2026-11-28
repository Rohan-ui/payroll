import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceModule } from './AttendanceModule';

/** Leaving an employee's attendance takes one click on the breadcrumb, not two. */

vi.mock('../../context/PayrollContext', async () => {
  const { useState } = await import('react');
  return {
    usePayroll: () => {
      const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
      return { selectedEmployeeId, setSelectedEmployeeId, setCurrentView: () => undefined };
    },
  };
});
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }));
vi.mock('./CosecRefresh', () => ({ useCosecRefresh: () => ({ status: 'idle' }), CosecRefreshNote: () => null }));
vi.mock('../../api/attendance.api', () => ({
  attendanceApi: {
    getDepartmentSummary: vi.fn().mockResolvedValue({ departments: [] }),
    getEmployeeDayList: vi.fn().mockResolvedValue({ items: [] }),
    getRosterMatrix: vi.fn().mockResolvedValue(null),
    getEmployeeMonth: vi.fn().mockResolvedValue({ employee: { fullName: 'Asha Rao', departmentName: 'Design', employeeCode: 'EMP1' }, days: [] }),
    getEmployeeYear: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('./layouts/CommandCenterLayout', () => ({
  CommandCenterLayout: ({ onSelectEmployee }: { onSelectEmployee: (id: string) => void }) => (
    <button type="button" onClick={() => onSelectEmployee('emp-1')}>Open Asha</button>
  ),
}));
vi.mock('./layouts/DepartmentBoardsLayout', () => ({ DepartmentBoardsLayout: () => null }));
vi.mock('./layouts/RosterMatrixLayout', () => ({ RosterMatrixLayout: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/attendance');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
const flush = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
const buttonNamed = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

describe('attendance breadcrumb', () => {
  it('returns to the attendance list on the first click', async () => {
    await act(async () => root.render(<AttendanceModule />));
    await flush();

    await act(async () => buttonNamed('Open Asha')!.click());
    await flush();
    expect(container.querySelector('h1')?.textContent).toBe('Asha Rao');
    expect(new URLSearchParams(window.location.search).get('employeeId')).toBe('emp-1');

    await act(async () => buttonNamed('Attendance')!.click());
    await flush();
    expect(container.querySelector('h1')?.textContent).toBe('Attendance');
    expect(new URLSearchParams(window.location.search).get('employeeId')).toBeNull();
  });
});
