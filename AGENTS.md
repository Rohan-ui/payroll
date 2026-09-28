Purpose

This repository is a production Payroll + HRMS SaaS. Treat payroll, attendance, leave, employee identity, permissions, bank details, statutory data, and financial records as business-critical.

Every change must preserve correctness, tenant isolation, payroll history, auditability, security, accessibility, maintainability, operational reliability, and responsive UX.

Prefer the smallest correct implementation. Do not add abstractions, dependencies, services, or patterns unless they solve a real current requirement.

Before coding

Inspect nearby code, package configuration, schema, migrations, tests, and existing conventions.

Understand the full data flow before changing payroll, salary, attendance, leave, payments, authorization, or employee identity.

Reuse established project patterns unless they are unsafe or incorrect.

Do not invent APIs, fields, routes, environment variables, or dependencies.

For non-trivial work identify inputs, trust boundaries, authorization, writes, transaction boundary, failure modes, audit needs, and tests.

Do not perform unrelated broad refactors while implementing a focused feature.

Definition of done

A task is not done just because the happy path renders.

As applicable, verify:

typecheck passes,

lint passes,

relevant unit/integration/e2e tests pass,

migrations are safe,

authorization is server-side,

tenant isolation is preserved,

loading/empty/error/success/disabled states exist,
keyboard/focus/accessibility are correct,

financial calculations use decimal-safe logic,

errors are observable without leaking sensitive data,

no debug logs, dead code, fake data, or commented-out blocks remain,

no unnecessary dependency was added.

Never claim a check passed unless it was actually run
Architecture

Domain boundaries

Keep these domains clear:

Platform Core

Tenants and subscriptions

Authentication

RBAC

Organization

Employees / HR

Attendance

Shifts

Holidays

Leave

Salary configuration

Payroll processing

Statutory payroll

Reimbursements

Loans / advances

Payments

Audit

Business rules belong in the appropriate domain/service/module, not in UI components or generic helpers.

Keep transport, validation, authorization, business rules, persistence, and presentation separated enough to test independently. Do not create abstraction layers only for appearance.

Multi-tenancy — mandatory

The SaaS uses a shared MySQL database with tenant isolation through tenant_id.

Never trust a tenant ID supplied by the browser for authorization. Derive the current tenant from authenticated membership/server context.

Every tenant-owned query must constrain tenant scope unless the relation itself safely guarantees it.

Bad conceptually:

prisma.employee.findUnique({ where: { id } })

Preferred conceptually:

prisma.employee.findFirst({
  where: { id, tenantId: currentTenantId },
})

For writes:

verify every referenced tenant-owned entity belongs to the same tenant,

preserve composite tenant-aware foreign keys where available,

never permit cross-tenant employee, role, department, payroll, attendance, leave, salary, document, reimbursement, loan, or payment references.

Global entities may intentionally omit tenant_id only when truly platform-global, such as users, permission definitions, modules, plans, and statutory scheme definitions.

Never weaken tenant constraints for convenience.

Add cross-tenant authorization tests for sensitive endpoints.

Database naming

Physical tables use:
rndtechnosoft_<plural_snake_case_entity>

Examples:

rndtechnosoft_employees

rndtechnosoft_employee_employments

rndtechnosoft_payroll_runs

rndtechnosoft_payslips

rndtechnosoft_payslip_lines

Columns:

PK: id

tenant boundary: tenant_id

FK: <entity>_id

business codes: explicit names such as employee_code, branch_code, component_code

statuses: specific names such as employee_status, run_status, payment_status

timestamps: created_at, updated_at, *_at

business dates: *_date, effective_from, effective_to

booleans: is_*, has_*, requires_*, allows_*

Avoid vague names such as data, info, value, type, or status when a domain-specific name exists.

Prisma models may use PascalCase/camelCase with @@map and @map to physical MySQL names.

PostgreSQL + Prisma

Target PostgreSQL 16+ unless the repository explicitly pins another supported version.

Use:

native UUID for identifiers,

NUMERIC / Prisma Decimal for salary, taxes, deductions, reimbursements, loans, payment amounts, percentages/rates,

DATE for date-only business values,

TIMESTAMPTZ for timestamps,

PostgreSQL JSONB only for flexible non-relational metadata/configuration.

Prefer UUIDv7 for new identifiers when the deployed PostgreSQL/runtime stack supports it safely. Otherwise keep native UUID columns with replaceable application/Prisma UUID generation.

Use PostgreSQL-native integrity features when they solve real correctness problems:

partial unique indexes,

expression indexes,

exclusion constraints,

btree_gist for effective-date overlap protection where justified.

Never use floating point for money.

Do not put relational business data into JSON to avoid proper modeling.

Reasonable JSON uses:

tenant settings,

calculation metadata,

audit snapshots,

provider metadata,

non-authoritative display metadata.

Keep employees, departments, salary components, payslip lines, leave ledger entries, attendance records, payroll inputs, approvals, repayments, permissions, and financial transactions relational.

Never use comma-separated foreign keys.
Effective-dated records

Never overwrite historically significant HR/payroll configuration when history matters.

Use effective_from / effective_to for:

employment assignment,

organization assignment,

reporting manager,

salary assignment,

employee salary component values,

bank account validity,

shift assignment,

leave policy assignment,

statutory enrollment.

Where the model uses it, effective_to = NULL means open-ended/current.

A change normally closes the old row and inserts a new row. Do not mutate history to make a new value appear as though it always existed.

For mutually exclusive effective-dated records, prefer PostgreSQL database enforcement where practical.

Use:

exclusion constraints with daterange(...) / tstzrange(...),

partial unique indexes for current-row rules,

transaction-level locking for multi-step effective-date changes.

Application validation is still required for clear UX, but must not be the only protection when PostgreSQL can enforce the invariant.

Concurrent writes must not produce two current salary assignments, current shifts, current primary managers, or similar conflicting records.

Employee identity

Keep distinct:

User = login identity

Tenant Member = user membership in a tenant

Employee = HR/employment identity

Do not assume every employee has a login, every user is an employee, or one user belongs to one tenant.

Do not move tenant ownership directly onto the global user for convenience.

Sensitive employee data

Treat as sensitive:

bank accounts,

PAN/Aadhaar/national IDs,

tax/statutory identifiers,

addresses,

personal contact details,

DOB,

salary/payroll,

documents.

Never log full sensitive values.

Encrypt highly sensitive identifiers/account numbers according to project security architecture
Authorization

All authorization is enforced server-side. UI hiding is presentation only.

Use RBAC with:

global permissions,

tenant-owned roles,

role permissions,

tenant-member roles.

Do not use one global user.role field as authorization.

Sensitive actions should have explicit permissions such as employee view/update, attendance edit, leave approve, salary view/edit, payroll calculate/approve/finalize, payslip view, and payment execute.

Do not reveal whether a resource exists in another tenant.

Payroll — highest priority

Historical payroll must be reproducible and auditable.

Never make an old finalized payslip depend on current mutable salary configuration.

Configuration may change:

salary components,

salary structures,

structure components,

employee salary assignments,

component values,

statutory settings.

Finalized historical outputs must not change:

payroll run employee results,

payslips,

payslip lines,

statutory deduction results,

payment records.

Payslip lines store the actual calculated values used at that time
Financial calculations

Do not use JavaScript binary floating point directly for payroll arithmetic.

Use the project's decimal/money representation consistently.

At boundaries validate:

scale,

currency,

sign,

rounding behavior.

Never calculate from UI-formatted currency strings.

Calculation order and rounding must be deterministic.

Do not repeatedly round at arbitrary intermediate steps.

Validate financial totals before finalization.

Salary configuration

Salary components are data-driven.

Do not add employee columns such as basic_salary, hra, bonus, pf, esi, tds for configurable payroll.

Use:

salary components,

salary structures,

salary structure components,

employee salary assignments,

employee salary component values.

Allowed conceptual calculation types include:

FIXED

PERCENTAGE

FORMULA

SYSTEM_CALCULATED

Do not evaluate arbitrary SQL or arbitrary executable code stored in the database.

Formula config is constrained metadata interpreted by trusted application payroll logic.

Salary increments create new effective-dated history, not destructive updates.

Variable payroll inputs

One-time/month-specific values belong in payroll inputs, not permanent salary configuration.

Examples:

bonus,

commission,

incentive,

overtime,

arrears,

reimbursement,

manual earning,

manual deduction.

Inputs need tenant, employee, period, salary component, amount, source, status, reference, and auditability.

Keep source/reference links for values originating from reimbursements, loans, attendance, or integrations.

Prevent duplicate posting through idempotency/reference uniqueness where appropriate.

Attendance

Keep source punches separate from calculated daily attendance.

rndtechnosoft_attendance_punches = source IN/OUT events.

rndtechnosoft_attendance_records = interpreted daily result such as PRESENT/ABSENT/HALF_DAY, worked minutes, payable minutes, late minutes, overtime, etc.

Do not casually delete or rewrite punch history.

Attendance calculation must use the shift effective on the attendance date, not only the current shift.

Manual corrections must be auditable.

Do not silently rewrite attendance already used in finalized payroll. Post-payroll correction should feed a later payroll correction workflow.

Shifts

Shift assignments are historical and effective-dated.

Handle cross-midnight shifts explicitly.

Do not assume checkout happens on the same calendar day or that every branch/tenant uses one timezone
API design

Use explicit action endpoints for sensitive transitions.

Prefer:

POST /payroll-runs/:id/calculate

POST /payroll-runs/:id/approve

POST /payroll-runs/:id/finalize

over a generic endpoint that accepts any status.

Validate input at the server boundary.

Use stable error shapes.

Do not expose raw DB errors.

Paginate large collections.

Do not return unbounded employee, attendance, payroll, payslip, audit, reimbursement, or payment lists.

Validation

Validate at the proper layers:

browser = UX,

API = trust/security boundary,

domain/service = business rules,

DB = structural invariants.

Client validation never replaces server validation.

Use DB constraints for durable rules such as NOT NULL, FK, UNIQUE, CHECK, valid ranges, and non-negative values where appropriate.

Errors

Represent expected business failures intentionally, including:

payroll finalized,

invalid status transition,

salary overlap,

insufficient leave,

duplicate payroll input,

unauthorized action,

cross-tenant reference,

stale/concurrent update.

Do not catch exceptions and return success.

Do not silently ignore failed writes.

Do not expose stack traces, SQL, secrets, or sensitive values to users.

User errors should explain what happened and what the user can do next
Audit

Audit security-sensitive and financially significant changes:

roles/permissions,

salary changes,

bank account changes,

attendance adjustments,

leave approvals,

payroll calculate/approve/finalize,

payment state,

statutory config.

Audit logs may use JSON snapshots but do not replace domain history.

Never store secrets or complete sensitive identifiers in audit data.
Frontend / UI

Quality bar

The UI must feel like a mature modern SaaS product, not a generic admin template.

Optimize for clarity, speed, confidence, accessibility, consistency, information hierarchy, and low cognitive load.

Avoid decorative complexity:

excessive gradients,

glassmorphism everywhere,

giant rounded cards for every section,

random color use,

unnecessary animation,

meaningless icons,

dense dashboard clutter,

excessive modals,

competing primary actions.

Important financial actions must look deliberate and unambiguous.

Design system

Use the existing design/component system first.

Do not create duplicate Button, Input, Modal, Select, Table, Badge, Card, Tooltip, Dropdown, or Form components.

Keep spacing, radius, typography, borders, elevation, focus states, statuses, and content widths consistent.

Use colors consistently for meaning. Never use color alone to communicate state.

Responsive design

Every new screen must work on mobile, tablet, laptop, and desktop.

Do not design desktop-only and rely on horizontal scrolling everywhere.

For payroll/attendance tables:

preserve important columns,

allow controlled horizontal scroll where unavoidable,

keep actions accessible,

use responsive details/column visibility where useful,

use sticky headers only when they help.

Complex forms should become sensible single-column layouts on narrow screens.

Navigation

Group navigation by user task/domain rather than database table.

Examples:

Employees

Attendance

Leave

Payroll

Reports

Settings

Keep primary navigation stable and page titles clear.

Dashboards

Dashboards should answer operational questions, not merely display cards.

Useful signals include:

employees needing action,

attendance exceptions,

pending leave,

upcoming payroll period,

payroll blockers/status,

payment status,

high-signal trends.

Avoid vanity metrics and unnecessary charts.

Tables

Production tables should support the dataset's needs:

pagination,

search,

filtering,

sorting,

loading,

empty state,

error state,

row actions,

clear headers.

Do not fetch thousands of rows and paginate only in the browser.

Financial columns should align consistently.

Format dates/currency using tenant/user locale/timezone rules.

Status must not rely on color only.

Forms

Use explicit labels; placeholders are not labels.

Provide constraints, inline validation, helpful errors, useful defaults, and clear required/optional indication.

Group related fields.

Do not make one giant employee form when identity, employment, contacts, bank, statutory, documents, and salary are separate concerns.

Prevent unsafe duplicate submission.

Financial/destructive actions

High-impact actions need specific confirmation text.

Avoid generic Are you sure?.

Prefer:
Finalize September 2026 payroll? Finalized payslips cannot be recalculated in place.

Do not add confirmation dialogs to harmless routine actions.

Loading

Prefer localized loading/skeleton states over blocking full-page spinners where possible.

Never optimistically claim a financial action succeeded before the server commits it.

Empty states

Explain:

what is empty,

why it matters,

what to do next.

Example:
No salary structure assigned. Assign one before including this employee in payroll.

Accessibility

Target WCAG 2.2 AA practices where applicable.

Use semantic HTML and ensure:

keyboard operability,

visible focus,

proper labels,

heading hierarchy,

accessible tables,

dialog focus management,

accessible errors,

adequate contrast,

reduced-motion respect.

Use buttons/links instead of clickable divs.

Icon-only controls require accessible names.

Do not remove focus outlines without an accessible replacement.

Modals / drawers / pages

Use modal for short focused actions, drawer when surrounding context matters, and a full page for complex workflows such as payroll review or salary structure editing.

Do not put complex nested forms inside small scrolling dialogs.

Notifications

Use toasts for transient confirmation only.

Critical errors must also appear in context.

Do not spam toasts for routine background requests.

Animation

Animation should explain state/change, not entertain.

Keep transitions subtle and respect reduced motion.

Never delay financial actions for decorative animation.

Engineering

TypeScript

If TypeScript is used:

keep strict mode,

avoid any,

avoid unsafe non-null assertions,

use unknown at untrusted boundaries and validate,

model domain states explicitly,

prefer narrow types.

Do not create giant unrelated shared type files.

React / Next.js

If React/Next.js is used:

keep components focused,

keep business logic outside components,

prefer server-side authorization/data access where appropriate,

minimize client components/global state,

avoid effects for directly derivable state,

avoid request waterfalls,

use caching deliberately.

Never cache private tenant data under a non-tenant-scoped key.

Never expose server secrets to client code.

Dependencies

Before adding a dependency ask:

Can platform/stdlib solve it safely?

Does an existing dependency already solve it?

Is it actively maintained?

What is the supply-chain/security cost?

Does it meaningfully reduce risk/code?

Do not add libraries for trivial helpers.

Review packages that execute install scripts or agent hooks before trusting them.

Security

At minimum:

validate untrusted input,

prevent injection,

render safely,

use CSRF protections when applicable,

secure cookies,

server-side authorization,

abuse/rate limiting for risky endpoints,

safe account recovery,

no secrets in source,

safe upload validation,

least-privilege credentials.

Never concatenate untrusted SQL.

Never trust client-supplied permissions/roles.

Never expose service credentials to the browser.

Authentication

Use the project's established auth/session provider.

Do not implement custom cryptography.

Use established password hashing.

Membership suspension and session invalidation must take effect predictably.

Logging / observability

Use structured logs.

Include useful non-sensitive context such as tenant ID, operation, payroll run ID, record ID, duration, and error category.

Never log passwords, tokens, full bank numbers, national IDs, or unnecessary salary payloads.

Important jobs/financial workflows should be measurable/traceable if observability infrastructure exists.

Background jobs

Use the existing job framework for long-running work such as payroll calculation, imports, bulk sync, or report generation when synchronous execution is unreliable.

Jobs should be retry-safe, idempotent where needed, observable, tenant-scoped, and recoverable.

Do not introduce a second queue framework without a clear need
Performance

Measure before complex optimization, but avoid obvious N+1 queries.

For lists:

select only needed fields,

paginate,

filter/sort server-side,

add indexes for real query patterns.

Do not send entire employee/payroll objects when a screen needs only a small subset.

Never cache sensitive tenant data without tenant-scoped keys and correct invalidation.
UI review checklist

Before declaring a new UI complete, verify:

visual hierarchy is clear,

one primary action is obvious,

spacing/typography are consistent,

loading/empty/error/disabled/success states exist,

keyboard/focus work,

mobile works,

long names/values do not break layout,

tables remain usable,

destructive actions are distinguishable,

currency/date formatting is correct,

sensitive values are masked,

permissions are enforced in both UI and server.

Use Figma/design references when provided, but preserve product consistency rather than blindly copying pixels.

Do not

Do not:

bypass authorization,

rely only on frontend validation,

trust browser tenant IDs,

use float for money,

hardcode salary components as columns,

mutate finalized payslips,

overwrite salary/employment/reporting history,

hard-delete finalized financial records,

store core financial data only in JSON,

store comma-separated IDs,

use generic CRUD updates for payroll lifecycle,

swallow errors,

fetch unbounded datasets,

add dependencies for trivial code,

create abstractions with no present use,

redesign unrelated screens while fixing one feature,

expose sensitive data in logs,

claim completion without verification

Earlier Voogyo Product Reference

When the user asks to look at the "earlier voogyo product", "previous voogyo code", or reference the prior implementation:
- Inspect `/home/bhavin-pathak/project/voogyo-erp/voogyo-erp` (located under `/home/bhavin-pathak/project/voogyo-erp`).
- Consult its codebase, migrations (`database/migrations/`), API endpoints (`src/app/api/v1/`), components (`src/components/`), libraries (`src/lib/`), and architecture docs (`WOOGIEO_ERP_MASTER_SPECIFICATION_AND_MIGRATION_BLUEPRINT.md` and `docs/`) to get a full overview and understand the prior implementation patterns.