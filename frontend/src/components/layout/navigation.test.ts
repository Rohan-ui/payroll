import { describe, it, expect } from 'vitest';
import type { NavigationEntry } from '../../api/auth.api';
import type { AppView } from '../../types/payroll.types';
import { currentNavigationId, sidebarTree } from './navigation';

const entry = (
  id: string,
  label: string,
  parent: string | null,
  module: string | null,
  moduleEnabled = true,
): NavigationEntry => ({ id, label, parent, module, moduleName: module, moduleEnabled });

const outline = (entries: NavigationEntry[]) =>
  sidebarTree(entries).map((item) => [item.entry.label, item.children.map((child) => child.entry.label)]);

describe('sidebar tree', () => {
  it('nests each feature under its business module, in server order', () => {
    expect(
      outline([
        entry('dashboard', 'Dashboard', null, null),
        entry('hrms', 'HRMS', null, 'HRMS'),
        entry('people', 'People', 'hrms', 'HRMS'),
        entry('attendance', 'Attendance', 'hrms', 'HRMS'),
        entry('finance', 'Finance', null, 'FINANCE'),
        entry('payroll', 'Payroll', 'finance', 'FINANCE'),
        entry('payslips', 'Payslips', 'finance', 'FINANCE'),
        entry('bookkeeping', 'Bookkeeping', 'finance', 'FINANCE'),
        entry('help', 'Help', null, null),
      ]),
    ).toEqual([
      ['Dashboard', []],
      ['HRMS', ['People', 'Attendance']],
      ['Finance', ['Payroll', 'Payslips', 'Bookkeeping']],
      ['Help', []],
    ]);
  });

  it('uses the labels the server sends', () => {
    expect(outline([entry('finance', 'Money', null, 'FINANCE'), entry('payroll', 'Salaries', 'finance', 'FINANCE')])).toEqual([
      ['Money', ['Salaries']],
    ]);
  });

  it('hides a switched-off module with everything in it', () => {
    expect(
      outline([
        entry('hrms', 'HRMS', null, 'HRMS'),
        entry('people', 'People', 'hrms', 'HRMS'),
        entry('finance', 'Finance', null, 'FINANCE', false),
        entry('payroll', 'Payroll', 'finance', 'FINANCE', false),
      ]),
    ).toEqual([['HRMS', ['People']]]);
  });

  it('drops a group with nothing it can open, and items it cannot draw', () => {
    expect(
      outline([
        entry('finance', 'Finance', null, 'FINANCE'),
        entry('treasury', 'Treasury', 'finance', 'FINANCE'),
        entry('unknown', 'Unknown', null, null),
        entry('help', 'Help', null, null),
      ]),
    ).toEqual([['Help', []]]);
  });
});

describe('current navigation item', () => {
  it('maps every employee screen to People and each CRM tab to its own item', () => {
    const employeeViews: AppView[] = ['people', 'add-employee', 'edit-employee', 'employee-detail'];
    expect(employeeViews.map((view) => currentNavigationId(view, 'pipeline'))).toEqual(['people', 'people', 'people', 'people']);
    expect(currentNavigationId('crm', 'masters')).toBe('crm.masters');
    expect(currentNavigationId('emails', 'pipeline')).toBe('crm.emails');
  });
});
