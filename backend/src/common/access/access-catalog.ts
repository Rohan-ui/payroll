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
  { id: 'crm.leads', label: 'Lead Management', module: 'CRM', parent: 'crm' },
  { id: 'crm.emails', label: 'Email & Marketing', module: 'CRM', parent: 'crm' },
  { id: 'crm.activities', label: 'Follow-ups & Meetings', module: 'CRM', parent: 'crm' },
  { id: 'crm.proposals', label: 'Quotations', module: 'CRM', parent: 'crm' },
  { id: 'crm.reports', label: 'Reports & Analytics', module: 'CRM', parent: 'crm' },
  { id: 'crm.audit-trail', label: 'Audit Trail', module: 'CRM', parent: 'crm' },
  { id: 'crm.masters', label: 'Masters', module: 'CRM', parent: 'crm' },
  { id: 'hrms', label: 'HRMS', module: 'HRMS', parent: null },
  { id: 'people', label: 'People', module: 'HRMS', parent: 'hrms' },
  { id: 'attendance', label: 'Attendance', module: 'HRMS', parent: 'hrms' },
  { id: 'onboarding', label: 'Onboarding', module: 'HRMS', parent: 'hrms' },
  { id: 'offboarding', label: 'Offboarding', module: 'HRMS', parent: 'hrms' },
  { id: 'performance', label: 'Performance', module: 'HRMS', parent: 'hrms' },
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
  { key: 'leads.view', name: 'View leads and their activity', section: 'crm', group: 'Leads', nav: 'crm.leads' },
  { key: 'leads.view_all', name: 'See every lead, including unassigned leads and other members\' leads', section: 'crm', group: 'Leads', nav: 'crm.leads' },
  { key: 'leads.create', name: 'Create and import leads', section: 'crm', group: 'Leads', nav: 'crm.leads' },
  { key: 'leads.update', name: 'Edit leads, log activity and mark deals won', section: 'crm', group: 'Leads', nav: 'crm.leads' },
  { key: 'leads.delete', name: 'Delete leads', section: 'crm', group: 'Leads', nav: 'crm.leads' },
  { key: 'leads.export', name: 'Export leads', section: 'crm', group: 'Leads', nav: 'crm.leads' },

  { key: 'marketing.view', name: 'Open Email & Marketing', section: 'crm', group: 'Email & Marketing', nav: 'crm.emails' },
  { key: 'marketing.manage', name: 'Send Gmail messages and manage templates', section: 'crm', group: 'Email & Marketing', nav: 'crm.emails' },

  { key: 'sequences.view', name: 'View drip sequences, enrollments and reports', section: 'crm', group: 'Drip Sequences', nav: 'crm.emails' },
  { key: 'sequences.manage', name: 'Create, edit, activate, pause and archive drip sequences, their sender and enrollment rules', section: 'crm', group: 'Drip Sequences', nav: 'crm.emails' },
  { key: 'sequences.enroll', name: 'Add leads to drip sequences and stop them', section: 'crm', group: 'Drip Sequences', nav: 'crm.emails' },
  { key: 'sequences.enroll_bulk', name: 'Add many leads to a drip sequence at once', section: 'crm', group: 'Drip Sequences', nav: 'crm.emails' },
  { key: 'sequences.logs.view', name: 'Read the emails drip sequences sent', section: 'crm', group: 'Drip Sequences', nav: 'crm.emails' },
  { key: 'sequences.suppression.manage', name: 'Manage the do-not-email list', section: 'crm', group: 'Drip Sequences', nav: 'crm.emails' },

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
  { key: 'masters.sources.update', name: 'Edit lead sources', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.sources.delete', name: 'Delete lead sources', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.lost_reasons.view', name: 'View lost reasons', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.lost_reasons.create', name: 'Create lost reasons', section: 'crm', group: 'Masters', nav: 'crm.masters' },
  { key: 'masters.lost_reasons.update', name: 'Edit lost reasons', section: 'crm', group: 'Masters', nav: 'crm.masters' },
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
  { key: 'documents.view', name: 'View document templates and letterheads', section: 'organization', group: 'Documents & letterheads', nav: 'organization' },
  { key: 'documents.templates.manage', name: 'Create and edit document templates (offer letters, quotations, appraisal letters)', section: 'organization', group: 'Documents & letterheads', nav: 'organization' },
  { key: 'documents.templates.approve', name: 'Approve document templates for use, and manage letterheads', section: 'organization', group: 'Documents & letterheads', nav: 'organization' },

  { key: 'people.view', name: 'View employees', section: 'hrms', group: 'People', nav: 'people' },
  { key: 'people.create', name: 'Add employees', section: 'hrms', group: 'People', nav: 'people' },
  { key: 'people.update', name: 'Edit employees', section: 'hrms', group: 'People', nav: 'people' },
  { key: 'people.bank.update', name: 'Add or change employee bank details', section: 'hrms', group: 'People', nav: 'people' },
  { key: 'people.login.manage', name: 'Link employees to their sign-in accounts', section: 'hrms', group: 'People', nav: 'people' },

  { key: 'attendance.view', name: 'View attendance', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.create', name: 'Record clock-in and clock-out punches', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.update', name: 'Request attendance corrections', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.approve', name: 'Approve attendance correction requests', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.adjust', name: 'Enter, edit or bulk-mark attendance', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'attendance.delete', name: 'Delete attendance records', section: 'hrms', group: 'Attendance', nav: 'attendance' },
  { key: 'onboarding.view', name: 'View onboarding candidates, interviews and the dashboard', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.candidates.manage', name: 'Add, edit and archive candidates and move them through the workflow', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.candidates.decide', name: 'Select or reject candidates after interviews', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.candidates.override', name: 'Override the candidate workflow with a recorded reason', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.interviews.schedule', name: 'Schedule, reschedule and cancel interviews', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.interviews.feedback', name: 'Record feedback on interviews you are on', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.offers.manage', name: 'Create, edit, submit and withdraw offers', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.offers.approve', name: 'Approve or reject offers you are asked to approve', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.offers.send', name: 'Send approved offers to candidates', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.documents.view', name: "View and download candidates' documents", section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.documents.manage', name: 'Request documents, upload them for candidates and send upload links', section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'onboarding.documents.verify', name: "Verify or reject candidates' documents", section: 'hrms', group: 'Onboarding', nav: 'onboarding' },
  { key: 'offboarding.my.view', name: 'Resign and follow their own exit (people only ever see their own)', section: 'hrms', group: 'Offboarding', nav: 'offboarding' },
  { key: 'offboarding.view', name: 'View exits, their checklists and exit interviews', section: 'hrms', group: 'Offboarding', nav: 'offboarding' },
  { key: 'offboarding.manage', name: 'Start exits, accept resignations, agree the last working day, record exit interviews and cancel exits', section: 'hrms', group: 'Offboarding', nav: 'offboarding' },
  { key: 'offboarding.clearance.update', name: 'Clear or waive exit-checklist items', section: 'hrms', group: 'Offboarding', nav: 'offboarding' },
  { key: 'offboarding.complete', name: 'Complete exits: set the exit date, mark the employee exited and end their sign-in to this workspace', section: 'hrms', group: 'Offboarding', nav: 'offboarding' },
  { key: 'performance.my.view', name: 'Use My appraisals and the review inbox (people only ever see their own appraisals and the reviews assigned to them)', section: 'hrms', group: 'Performance', nav: 'performance' },
  { key: 'performance.cycles.view', name: 'View appraisal cycles, appraisals and their progress', section: 'hrms', group: 'Performance', nav: 'performance' },
  { key: 'performance.cycles.manage', name: 'Create and launch appraisal cycles, set targets, and assign or replace reviewers', section: 'hrms', group: 'Performance', nav: 'performance' },
  { key: 'performance.reviews.view_all', name: 'Read every review, including anonymous reviewers’ names and answers', section: 'hrms', group: 'Performance', nav: 'performance' },
  { key: 'performance.library.view', name: 'View KRAs, KPIs, rating scales, appraisal templates, review workflows and department heads', section: 'hrms', group: 'Performance setup', nav: 'performance' },
  { key: 'performance.library.manage', name: 'Create, edit, duplicate and archive KRAs and KPIs', section: 'hrms', group: 'Performance setup', nav: 'performance' },
  { key: 'performance.scales.manage', name: 'Create rating scales and publish new versions of them', section: 'hrms', group: 'Performance setup', nav: 'performance' },
  { key: 'performance.workflows.manage', name: 'Create review workflows: who reviews whom, how many, in what order, and publish them', section: 'hrms', group: 'Performance setup', nav: 'performance' },
  { key: 'performance.templates.manage', name: 'Create appraisal templates, set their weights, scoring and questions, and publish them', section: 'hrms', group: 'Performance setup', nav: 'performance' },
  { key: 'performance.department_heads.manage', name: 'Appoint, end and cancel department heads', section: 'hrms', group: 'Performance setup', nav: 'performance' },
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
  { key: 'payroll.policies.view', name: 'View payroll policies', section: 'finance', group: 'Payroll policies', nav: 'payroll' },
  { key: 'payroll.policies.manage', name: 'Create payroll policies and publish new versions of their rules', section: 'finance', group: 'Payroll policies', nav: 'payroll' },
  { key: 'payroll.inputs.manage', name: 'Enter monthly payroll amounts such as bonuses, incentives and deductions', section: 'finance', group: 'Payroll inputs', nav: 'payroll' },
  { key: 'payroll.inputs.approve', name: 'Approve or reject monthly payroll amounts', section: 'finance', group: 'Payroll inputs', nav: 'payroll' },
  { key: 'payroll.overtime.approve', name: 'Approve or reject overtime for payroll', section: 'finance', group: 'Payroll inputs', nav: 'payroll' },
  { key: 'payroll.loans.manage', name: 'Give employees loans and advances and manage their recovery', section: 'finance', group: 'Payroll inputs', nav: 'payroll' },
  { key: 'salary.view', name: 'View salary components, structures and employee salaries', section: 'finance', group: 'Salary setup', nav: 'payroll' },
  { key: 'salary.configure', name: 'Create salary components and structures', section: 'finance', group: 'Salary setup', nav: 'payroll' },
  { key: 'salary.assign', name: 'Assign salaries to employees', section: 'finance', group: 'Salary setup', nav: 'payroll' },

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
