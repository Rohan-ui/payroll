/**
 * Permission, navigation and module catalogs for tenant access control.
 *
 * This file is the single source of truth. Permission keys are stored in
 * `rndtechnosoft_permissions` (kept in step by migration, checked by test).
 * Roles are tenant-owned and hold keys only through
 * `rndtechnosoft_role_permissions` rows; no role is authorized by its name or
 * code. The frontend renders the sidebar, the Roles page and the Modules page
 * from what the API derives from this catalog, and holds no permission lists
 * or module structure of its own. The API refuses a switched-off module's
 * routes by the module that owns their permissions here.
 */

export const MODULES = [
  {
    code: 'CRM',
    name: 'CRM & Sales',
    description: 'Leads, pipelines, follow-ups, meetings, quotations and email outreach.',
    requires: [],
  },
  {
    code: 'HRMS',
    name: 'HRMS',
    description: 'People and attendance: employee records, attendance, leave and biometric device sync.',
    requires: [],
  },
  {
    code: 'FINANCE',
    name: 'Finance',
    description: 'Payroll runs and salary setup, payslips, and bookkeeping.',
    // Payroll is calculated from employee and attendance records.
    requires: ['HRMS'],
  },
] as const;

export type ModuleCode = (typeof MODULES)[number]['code'];

export function isModuleCode(value: string): value is ModuleCode {
  return MODULES.some((m) => m.code === value);
}

export type ModuleStates = Record<ModuleCode, boolean>;

/**
 * The application sidebar, in order. A business module is a parent item whose
 * children are its features, and every child belongs to its parent's module.
 * Ids match the frontend's views (CRM children are `crm.<tab>`). An item is
 * shown to a member who holds at least one permission that names it, while its
 * module is switched on; a parent is shown when any of its children is.
 */
export const NAVIGATION = [
  { id: 'dashboard', label: 'Dashboard', module: null, parent: null },
  { id: 'crm', label: 'CRM & Sales', module: 'CRM', parent: null },
  { id: 'crm.cold-funnel', label: 'Client Outreach', module: 'CRM', parent: 'crm' },
  { id: 'crm.pipeline', label: 'Sales Pipelines', module: 'CRM', parent: 'crm' },
  { id: 'crm.emails', label: 'Email & Marketing', module: 'CRM', parent: 'crm' },
  { id: 'crm.activities', label: 'Follow-ups & Meetings', module: 'CRM', parent: 'crm' },
  { id: 'crm.proposals', label: 'Quotations', module: 'CRM', parent: 'crm' },
  { id: 'crm.reports', label: 'Reports & Analytics', module: 'CRM', parent: 'crm' },
  { id: 'crm.audit-trail', label: 'Audit Trail', module: 'CRM', parent: 'crm' },
  { id: 'crm.masters', label: 'Masters', module: 'CRM', parent: 'crm' },
  { id: 'hrms', label: 'HRMS', module: 'HRMS', parent: null },
  { id: 'people', label: 'People', module: 'HRMS', parent: 'hrms' },
  { id: 'attendance', label: 'Attendance', module: 'HRMS', parent: 'hrms' },
  { id: 'finance', label: 'Finance', module: 'FINANCE', parent: null },
  { id: 'payroll', label: 'Payroll', module: 'FINANCE', parent: 'finance' },
  { id: 'payslips', label: 'Payslips', module: 'FINANCE', parent: 'finance' },
  { id: 'bookkeeping', label: 'Bookkeeping', module: 'FINANCE', parent: 'finance' },
  { id: 'organization', label: 'Organization & Settings', module: null, parent: null },
  { id: 'reports', label: 'Reports', module: 'FINANCE', parent: null },
  { id: 'settings', label: 'Compliance', module: 'HRMS', parent: null },
  { id: 'help', label: 'Help', module: null, parent: null },
] as const;

export type NavigationId = (typeof NAVIGATION)[number]['id'];

/**
 * Every permission, with the Roles page section and feature group it is listed
 * under and the sidebar item it reveals (`nav: null` for API-only resources
 * that have no screen yet). The section's module owns the permission: its API
 * is refused while that module is off. Only actions the backend actually
 * implements are listed.
 */
export const PERMISSIONS = [
  { key: 'dashboard.view', name: 'View the dashboard', section: 'dashboard', group: 'Dashboard', nav: 'dashboard' },

  { key: 'outreach.view', name: 'View outreach cadences', section: 'crm', group: 'Client Outreach', nav: 'crm.cold-funnel' },
  { key: 'outreach.create', name: 'Enroll leads in outreach and load sample leads', section: 'crm', group: 'Client Outreach', nav: 'crm.cold-funnel' },
  { key: 'outreach.update', name: 'Complete outreach steps and change reply branches', section: 'crm', group: 'Client Outreach', nav: 'crm.cold-funnel' },

  { key: 'pipelines.view', name: 'View pipelines and stages', section: 'crm', group: 'Sales Pipelines', nav: 'crm.pipeline' },
  { key: 'pipelines.create', name: 'Create pipelines', section: 'crm', group: 'Sales Pipelines', nav: 'crm.pipeline' },
  { key: 'pipelines.update', name: 'Add, edit, reorder and remove pipeline stages', section: 'crm', group: 'Sales Pipelines', nav: 'crm.pipeline' },
  { key: 'pipelines.delete', name: 'Delete pipelines', section: 'crm', group: 'Sales Pipelines', nav: 'crm.pipeline' },
  { key: 'leads.view', name: 'View leads and their activity', section: 'crm', group: 'Leads', nav: 'crm.pipeline' },
  { key: 'leads.create', name: 'Create and import leads', section: 'crm', group: 'Leads', nav: 'crm.pipeline' },
  { key: 'leads.update', name: 'Edit leads, log activity and mark deals won', section: 'crm', group: 'Leads', nav: 'crm.pipeline' },
  { key: 'leads.delete', name: 'Delete leads', section: 'crm', group: 'Leads', nav: 'crm.pipeline' },
  { key: 'leads.export', name: 'Export leads', section: 'crm', group: 'Leads', nav: 'crm.pipeline' },

  { key: 'marketing.view', name: 'Open Email & Marketing', section: 'crm', group: 'Email & Marketing', nav: 'crm.emails' },
  { key: 'marketing.manage', name: 'Send Gmail messages and manage templates', section: 'crm', group: 'Email & Marketing', nav: 'crm.emails' },

  { key: 'followups.view', name: 'View follow-ups', section: 'crm', group: 'Follow-ups & Meetings', nav: 'crm.activities' },
  { key: 'followups.create', name: 'Schedule follow-ups', section: 'crm', group: 'Follow-ups & Meetings', nav: 'crm.activities' },
  { key: 'followups.update', name: 'Update and complete follow-ups', section: 'crm', group: 'Follow-ups & Meetings', nav: 'crm.activities' },
  { key: 'followups.delete', name: 'Delete follow-ups', section: 'crm', group: 'Follow-ups & Meetings', nav: 'crm.activities' },
  { key: 'meetings.view', name: 'View meetings', section: 'crm', group: 'Follow-ups & Meetings', nav: 'crm.activities' },
  { key: 'meetings.create', name: 'Schedule meetings', section: 'crm', group: 'Follow-ups & Meetings', nav: 'crm.activities' },
  { key: 'meetings.update', name: 'Update meetings and record minutes', section: 'crm', group: 'Follow-ups & Meetings', nav: 'crm.activities' },
  { key: 'meetings.delete', name: 'Delete meetings', section: 'crm', group: 'Follow-ups & Meetings', nav: 'crm.activities' },

  { key: 'quotations.view', name: 'View quotations and templates', section: 'crm', group: 'Quotations', nav: 'crm.proposals' },
  { key: 'quotations.create', name: 'Create quotations', section: 'crm', group: 'Quotations', nav: 'crm.proposals' },
  { key: 'quotations.update', name: 'Edit quotations and change their status', section: 'crm', group: 'Quotations', nav: 'crm.proposals' },
  { key: 'quotations.delete', name: 'Delete quotations', section: 'crm', group: 'Quotations', nav: 'crm.proposals' },

  { key: 'clients.view', name: 'View clients', section: 'crm', group: 'Clients', nav: null },
  { key: 'clients.create', name: 'Create clients', section: 'crm', group: 'Clients', nav: null },
  { key: 'clients.update', name: 'Edit clients', section: 'crm', group: 'Clients', nav: null },

  { key: 'analytics.view', name: 'View CRM reports and analytics', section: 'crm', group: 'Reports & Analytics', nav: 'crm.reports' },

  { key: 'masters.services.view', name: 'View services', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.services.create', name: 'Create services', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.services.update', name: 'Edit services', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.services.delete', name: 'Delete services', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.sources.view', name: 'View lead sources', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.sources.create', name: 'Create lead sources', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.sources.delete', name: 'Delete lead sources', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.lost_reasons.view', name: 'View lost reasons', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.lost_reasons.delete', name: 'Delete lost reasons', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.industries.view', name: 'View industries', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.industries.create', name: 'Create industries and sub-industries', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.industries.update', name: 'Edit industries and sub-industries', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.industries.delete', name: 'Delete industries and sub-industries', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.sop.view', name: 'View the outreach playbook (steps and reply branches)', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.sop.update', name: 'Add, edit and remove outreach playbook steps and objection strategies', section: 'crm', group: 'Masters', nav: 'crm.masters' },

  { key: 'audit.view', name: 'View the CRM audit trail', section: 'crm', group: 'Audit Trail', nav: 'crm.audit-trail' },

  { key: 'organization.view', name: 'View organization settings', section: 'organization', group: 'Organization', nav: 'organization' },
  { key: 'organization.update', name: 'Edit organization profile, SMTP and WhatsApp settings', section: 'organization', group: 'Organization', nav: 'organization' },
  { key: 'users.view', name: 'View team members', section: 'organization', group: 'Team members', nav: 'organization' },
  { key: 'users.create', name: 'Add team members', section: 'organization', group: 'Team members', nav: 'organization' },
  { key: 'users.update', name: 'Edit team members, their roles and status', section: 'organization', group: 'Team members', nav: 'organization' },
  { key: 'users.delete', name: 'Remove team members', section: 'organization', group: 'Team members', nav: 'organization' },
  { key: 'roles.view', name: 'View roles', section: 'organization', group: 'Roles & permissions', nav: 'organization' },
  { key: 'roles.create', name: 'Create roles', section: 'organization', group: 'Roles & permissions', nav: 'organization' },
  { key: 'roles.update', name: 'Edit roles and the permissions they grant', section: 'organization', group: 'Roles & permissions', nav: 'organization' },
  { key: 'roles.delete', name: 'Delete roles', section: 'organization', group: 'Roles & permissions', nav: 'organization' },
  { key: 'permissions.view', name: 'View the permission catalog', section: 'organization', group: 'Roles & permissions', nav: 'organization' },
  { key: 'modules.view', name: 'View workspace modules', section: 'organization', group: 'Modules & apps', nav: 'organization' },
  { key: 'modules.update', name: 'Turn workspace modules on or off', section: 'organization', group: 'Modules & apps', nav: 'organization' },

  { key: 'people.view', name: 'View employees', section: 'hrms', group: 'People', nav: 'people' },
  { key: 'people.create', name: 'Add employees', section: 'hrms', group: 'People', nav: 'people' },
  { key: 'people.update', name: 'Edit employees', section: 'hrms', group: 'People', nav: 'people' },
  { key: 'people.bank.update', name: 'Add or change employee bank details', section: 'hrms', group: 'People', nav: 'people' },

  { key: 'attendance.view', name: 'View attendance', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.create', name: 'Record clock-in and clock-out punches', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.update', name: 'Request attendance corrections', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.approve', name: 'Approve attendance correction requests', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.adjust', name: 'Enter, edit or bulk-mark attendance', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.delete', name: 'Delete attendance records', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'leave.view', name: 'View leave types and balances', section: 'hrms', group: 'Leave', nav: null },
  { key: 'leave.create', name: 'Submit leave requests', section: 'hrms', group: 'Leave', nav: null },
  { key: 'leave.approve', name: 'Approve leave requests', section: 'hrms', group: 'Leave', nav: null },
  { key: 'leave.configure', name: 'Create leave types', section: 'hrms', group: 'Leave', nav: null },
  { key: 'attendance.integration.view', name: 'View biometric device (COSEC) settings and data', section: 'hrms', group: 'Biometric device (COSEC)', nav: 'settings' },
  { key: 'attendance.integration.update', name: 'Change and test biometric device (COSEC) settings', section: 'hrms', group: 'Biometric device (COSEC)', nav: 'settings' },
  { key: 'attendance.sync', name: 'Sync attendance from the biometric device', section: 'hrms', group: 'Biometric device (COSEC)', nav: 'settings' },

  { key: 'payroll.view', name: 'View payroll periods and runs', section: 'finance', group: 'Payroll', nav: 'payroll' },
  { key: 'payroll.create', name: 'Create payroll periods and runs', section: 'finance', group: 'Payroll', nav: 'payroll' },
  { key: 'payroll.process', name: 'Calculate payroll runs', section: 'finance', group: 'Payroll', nav: 'payroll' },
  { key: 'payroll.approve', name: 'Approve payroll runs', section: 'finance', group: 'Payroll', nav: 'payroll' },
  { key: 'payroll.finalize', name: 'Finalize payroll runs (irreversible)', section: 'finance', group: 'Payroll', nav: 'payroll' },
  { key: 'salary.view', name: 'View salary components, structures and employee salaries', section: 'finance', group: 'Salary setup', nav: null },
  { key: 'salary.configure', name: 'Create salary components and structures', section: 'finance', group: 'Salary setup', nav: null },
  { key: 'salary.assign', name: 'Assign salaries to employees', section: 'finance', group: 'Salary setup', nav: null },

  { key: 'payslips.view', name: 'View payslips', section: 'finance', group: 'Payslips', nav: 'payslips' },

  { key: 'bookkeeping.financial_years.view', name: 'View financial years', section: 'finance', group: 'Bookkeeping', nav: 'bookkeeping' },
  { key: 'bookkeeping.financial_years.create', name: 'Create financial years', section: 'finance', group: 'Bookkeeping', nav: 'bookkeeping' },
  { key: 'bookkeeping.financial_years.close', name: 'Close financial years', section: 'finance', group: 'Bookkeeping', nav: 'bookkeeping' },
  { key: 'bookkeeping.ledgers.view', name: 'View ledgers and the trial balance', section: 'finance', group: 'Bookkeeping', nav: 'bookkeeping' },
  { key: 'bookkeeping.entries.view', name: 'View journal entries', section: 'finance', group: 'Bookkeeping', nav: 'bookkeeping' },
  { key: 'bookkeeping.entries.post', name: 'Post payroll accounting entries', section: 'finance', group: 'Bookkeeping', nav: 'bookkeeping' },

  { key: 'reports.view', name: 'View reports', section: 'reports', group: 'Reports', nav: 'reports' },
  { key: 'compliance.view', name: 'View compliance', section: 'settings', group: 'Compliance', nav: 'settings' },
  { key: 'help.view', name: 'View help', section: 'help', group: 'Help', nav: 'help' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);

export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSION_KEYS as readonly string[]).includes(value);
}

const PERMISSION_MODULES = new Map<string, ModuleCode | null>(
  PERMISSIONS.map((p) => [p.key, NAVIGATION.find((item) => item.id === p.section)?.module ?? null]),
);

/**
 * The module that owns a permission (its section's module), or null for
 * workspace-wide ones. ModuleAccessGuard refuses a route while the module
 * owning any of its permissions is off, so a feature's API moves with it here.
 */
export function permissionModule(key: string): ModuleCode | null {
  return PERMISSION_MODULES.get(key) ?? null;
}

/** What a module's switch covers, as the feature groups of its permissions (People, Leave, Payroll, …). */
export function moduleCapabilities(code: ModuleCode): string[] {
  const sections = new Set<string>(NAVIGATION.filter((item) => item.module === code).map((item) => item.id));
  const groups: string[] = [];
  for (const permission of PERMISSIONS) {
    if (sections.has(permission.section) && !groups.includes(permission.group)) groups.push(permission.group);
  }
  return groups;
}

/** The screens a module's switch hides: its sidebar items that are not groups. */
export function moduleFeatures(code: ModuleCode): string[] {
  const parents = new Set<string>(NAVIGATION.map((item) => item.parent).filter((id) => id !== null));
  return NAVIGATION.filter((item) => item.module === code && !parents.has(item.id)).map((item) => item.label);
}

/**
 * The one definition of the workspace owner / administrator role. It is
 * granted every permission when created (and by migration for existing
 * workspaces), its grants cannot be edited, and a workspace always keeps at
 * least one active member holding it, so a workspace cannot lock itself out.
 */
export const ADMIN_ROLE_CODE = 'ADMIN';

/**
 * Reads the per-tenant module switches stored at `settings.modules` as
 * `[{ id, is_enabled }]`. A module without a stored switch is enabled, so
 * workspaces that never touched the setting keep full access.
 */
export function resolveModuleStates(stored: unknown): ModuleStates {
  const states = Object.fromEntries(MODULES.map((m) => [m.code, true])) as ModuleStates;

  if (Array.isArray(stored)) {
    for (const entry of stored) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as { id?: unknown }).id === 'string' &&
        isModuleCode((entry as { id: string }).id) &&
        typeof (entry as { is_enabled?: unknown }).is_enabled === 'boolean'
      ) {
        states[(entry as { id: ModuleCode }).id] = (entry as { is_enabled: boolean }).is_enabled;
      }
    }
  }

  return states;
}

/** Modules switched on while a module they require is off, e.g. Finance without HRMS. */
export function unmetModuleRequirements(states: ModuleStates): { module: ModuleCode; missing: ModuleCode[] }[] {
  return MODULES.filter((m) => states[m.code])
    .map((m) => ({ module: m.code, missing: (m.requires as readonly ModuleCode[]).filter((code) => !states[code]) }))
    .filter((entry) => entry.missing.length > 0);
}

export interface NavigationEntry {
  id: NavigationId;
  label: string;
  parent: NavigationId | null;
  module: ModuleCode | null;
  moduleName: string | null;
  moduleEnabled: boolean;
}

/**
 * The sidebar items a member may open, in order: those named by a permission
 * they hold, plus the parent of any such child. The client draws the tree from
 * `label` and `parent`, and `moduleEnabled` lets it hide items whose module is
 * off and explain why, without knowing the structure itself.
 */
export function resolveNavigation(permissions: readonly string[], modules: ModuleStates): NavigationEntry[] {
  const granted = new Set<string>();
  for (const permission of PERMISSIONS) {
    if (permission.nav && permissions.includes(permission.key)) granted.add(permission.nav);
  }
  for (const item of NAVIGATION) {
    if (item.parent && granted.has(item.id)) granted.add(item.parent);
  }

  return NAVIGATION.filter((item) => granted.has(item.id)).map((item) => ({
    id: item.id,
    label: item.label,
    parent: item.parent,
    module: item.module,
    moduleName: item.module ? (MODULES.find((m) => m.code === item.module)?.name ?? null) : null,
    moduleEnabled: item.module ? modules[item.module] : true,
  }));
}

/** The permission catalog grouped for the Roles page, in sidebar order. */
export function groupPermissionCatalog() {
  return NAVIGATION.filter((item) => item.parent === null)
    .map((section) => {
      const groups = new Map<string, { key: PermissionKey; name: string }[]>();
      for (const permission of PERMISSIONS) {
        if (permission.section !== section.id) continue;
        const list = groups.get(permission.group) ?? [];
        list.push({ key: permission.key, name: permission.name });
        groups.set(permission.group, list);
      }
      return {
        section: section.label,
        module: section.module,
        groups: [...groups.entries()].map(([group, permissions]) => ({ group, permissions })),
      };
    })
    .filter((section) => section.groups.length > 0);
}
