import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmploymentTypesMaster } from './EmploymentTypesMaster';
import { CandidateForm } from '../onboarding/CandidateForm';
import type { CandidateDetail, OnboardingMeta } from '../../api/onboarding.api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let granted = new Set<string>();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ can: (p: string) => granted.has(p) }),
}));

const mockEmploymentTypes = [
  {
    id: 'et-1',
    code: 'FULL_TIME',
    name: 'Full-time',
    description: 'Permanent employee',
    status: 'ACTIVE' as const,
    isActive: true,
    candidatesCount: 5,
    offersCount: 2,
    employeesCount: 10,
    policyScopesCount: 1,
    isReferenced: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'et-2',
    code: 'INTERNSHIP',
    name: 'Internship',
    description: 'Fixed term internship',
    status: 'INACTIVE' as const,
    isActive: false,
    candidatesCount: 0,
    offersCount: 0,
    employeesCount: 0,
    policyScopesCount: 0,
    isReferenced: false,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  granted = new Set(['organization.view', 'organization.update', 'onboarding.view']);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/tenant/employment-types')) {
        let list = [...mockEmploymentTypes];
        if (url.includes('search=Intern')) {
          list = list.filter((x) => x.name.includes('Intern'));
        }
        return new Response(JSON.stringify({ success: true, data: list }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('EmploymentTypesMaster', () => {
  it('loads and displays employment types with their status, usage counts, and descriptions', async () => {
    await act(async () => {
      root.render(<EmploymentTypesMaster canEdit={true} />);
    });
    // Allow state updates from fetch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container.textContent).toContain('Full-time');
    expect(container.textContent).toContain('Permanent employee');
    expect(container.textContent).toContain('Internship');
    expect(container.textContent).toContain('Active');
    expect(container.textContent).toContain('Inactive');
    expect(container.textContent).toContain('17 records'); // 5+2+10 = 17 records
  });

  it('filters employment types when search text is typed', async () => {
    await act(async () => {
      root.render(<EmploymentTypesMaster canEdit={true} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const searchInput = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(searchInput).toBeTruthy();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(searchInput, 'Intern');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(container.textContent).toContain('Internship');
    expect(container.textContent).not.toContain('Full-time');
  });
});

describe('CandidateForm Employment Type Integration', () => {
  const metaWithTypes: OnboardingMeta = {
    departments: [],
    designations: [],
    employmentTypes: [
      { id: 'et-1', name: 'Full-time' },
      { id: 'et-3', name: 'Contract' },
    ],
    members: [],
  };

  const metaEmptyTypes: OnboardingMeta = {
    departments: [],
    designations: [],
    employmentTypes: [],
    members: [],
  };

  it('renders dropdown with active employment types when available', async () => {
    await act(async () => {
      root.render(
        <CandidateForm
          candidate={null}
          meta={metaWithTypes}
          onCancel={() => {}}
          onSaved={() => {}}
        />,
      );
    });

    const select = container.querySelector('select[id$="-employmentTypeId"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain('Not decided');
    expect(options).toContain('Full-time');
    expect(options).toContain('Contract');
    expect(options).not.toContain('None set up yet');
  });

  it('displays empty state message when no employment types are configured', async () => {
    await act(async () => {
      root.render(
        <CandidateForm
          candidate={null}
          meta={metaEmptyTypes}
          onCancel={() => {}}
          onSaved={() => {}}
        />,
      );
    });

    const select = container.querySelector('select[id$="-employmentTypeId"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.options[0]?.text).toBe('No employment types have been configured.');
    expect(container.textContent).toContain('No employment types have been configured.');
    expect(container.textContent).toContain('Create one now');
  });

  it('shows action buttons to add new or open settings for authorized administrators', async () => {
    await act(async () => {
      root.render(
        <CandidateForm
          candidate={null}
          meta={metaWithTypes}
          onCancel={() => {}}
          onSaved={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain('Add new');
    expect(container.textContent).toContain('Settings');
  });

  it('includes inactive employment type option when editing a candidate who has it assigned', async () => {
    const candidateWithInactiveType: CandidateDetail = {
      id: 'c-1',
      candidateCode: 'CAN-100',
      fullName: 'Vikram Mehta',
      email: 'vikram@example.com',
      phone: null,
      address: null,
      appliedPosition: 'Fullstack Dev',
      departmentId: null,
      departmentName: null,
      designationId: null,
      designationName: null,
      employmentTypeId: 'et-old',
      employmentTypeName: 'Probationary',
      hiringSource: null,
      expectedSalary: null,
      experienceYears: null,
      expectedJoiningDate: null,
      recruiterMemberId: null,
      recruiterName: null,
      notes: null,
      employeeId: null,
      manualMoves: [],
      interviews: [],
      offers: [],
      timeline: [],
      status: 'NEW',
      archivedAt: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    await act(async () => {
      root.render(
        <CandidateForm
          candidate={candidateWithInactiveType}
          meta={metaWithTypes}
          onCancel={() => {}}
          onSaved={() => {}}
        />,
      );
    });

    const select = container.querySelector('select[id$="-employmentTypeId"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = Array.from(select.options).map((o) => o.text);
    expect(options).toContain('Probationary (Inactive)');
  });
});
