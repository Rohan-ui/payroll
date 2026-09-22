---
name: sde3-payroll-dev
description: >
  Activates SDE-3 level engineering discipline for the RNDTechnosoft Payroll + HRMS SaaS.
  Enforces project context awareness, security, dependency hygiene, structured testing,
  and scalability thinking on every task. Use this skill on ANY coding or design task
  in the payroll repository.
---

# SDE-3 Payroll Development Skill

## 1. Project Context — Always Hold This in Mind

### Identity
- **Product**: RNDTechnosoft Payroll + HRMS — a **multi-tenant SaaS** serving multiple companies on a shared PostgreSQL database.
- **Brand/Namespace**: `rndtechnosoft_` (all physical table names carry this prefix).
- **Active branch**: `ravishah` (personal dev branch). Merge with care; production data is real.
- **Earlier Voogyo Codebase**: When asked to look into the earlier Voogyo product or codebase, look directly in `/Users/ravishah/git folder/voogyo-erp` (under `/Users/ravishah/git folder`).

### Repository Layout
```
payroll/
├── backend/          # NestJS 10 + Prisma 5 + TypeScript strict
│   ├── src/
│   │   ├── main.ts                   # Bootstrap: global ValidationPipe, CORS, shutdown hooks
│   │   ├── app.module.ts             # Root module; TenantContextMiddleware on all routes
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   ├── filters/              # AllExceptionsFilter
│   │   │   ├── guards/               # tenant.guard.ts
│   │   │   ├── interfaces/
│   │   │   ├── middleware/           # TenantContextMiddleware
│   │   │   └── utils/
│   │   ├── prisma/                   # PrismaService + PrismaModule
│   │   └── modules/
│   │       ├── auth/                 # JWT auth, session, RBAC
│   │       ├── audit/                # Audit log writes
│   │       ├── tenants/              # Tenant + subscription management
│   │       ├── super-admin/          # Platform-level admin
│   │       ├── employees/            # HR identity, docs, bank, identifiers
│   │       ├── attendance/           # Punches → records → adjustments
│   │       ├── leave/                # Policies, balances, requests
│   │       ├── salary/               # Components, structures, assignments
│   │       ├── payroll/              # Runs, calculation, approval, finalization
│   │       ├── bookkeeping/          # Financial ledger
│   │       ├── crm/                  # CRM workflows
│   │       └── external-api/         # Third-party integrations
└── frontend/         # React 18 + Vite 6 + TypeScript + TailwindCSS 3
    └── src/
        ├── api/      # Typed API client functions (all fetch calls live here)
        ├── components/
        ├── context/  # React context (auth, tenant, etc.)
        ├── views/    # Page-level components
        ├── types/    # Shared TS types
        └── utils/
```

### Full Stack
| Layer | Technology |
|---|---|
| Runtime | Node.js LTS |
| Backend Framework | NestJS 10 (class-based modules, DI) |
| ORM | Prisma 5 with PostgreSQL 16 |
| Language | TypeScript 5 strict mode — no `any`, no unsafe assertions |
| Validation | `class-validator` + `class-transformer` DTOs |
| API prefix | `/api/v1` |
| Auth | JWT HS256 via `JWT_SECRET`; tenant resolved by TenantContextMiddleware |
| Frontend | React 18, Vite 6, TailwindCSS 3, Recharts, Lucide icons |
| State | React Context (no Redux/Zustand unless already present) |
| Money/Decimals | Prisma `Decimal` (`@db.Decimal(18,2)`) — NEVER float |
| IDs | UUID (`@db.Uuid`) |
| Timestamps | `TIMESTAMPTZ(6)` for timestamps; `DATE` for date-only fields |
| Secrets | `.env` — never commit, never log, never expose to client |

---

## 2. Before Writing Any Code — SDE-3 Pre-Flight

Run through this mentally before writing a single line:

1. **Understand the full data flow**: request → guard → controller → service → Prisma → DB → response.
2. **Find existing patterns**: Check the relevant module. Do NOT invent a pattern when one already exists.
3. **Identify trust boundaries**: Tenant ID always comes from server context (TenantContextMiddleware), never from request body/params.
4. **Map the transaction boundary**: Which writes must be atomic? Use `prisma.$transaction()`.
5. **Enumerate failure modes**: DB down, missing entity, race condition, duplicate request.
6. **Check audit requirement**: Salary change? Bank data? Payroll state? Roles? → Must write audit log.

---

## 3. Security — Non-Negotiable Rules

### Multi-Tenancy (Critical)
```typescript
// NEVER — trusts client-supplied ID, cross-tenant leak risk
prisma.rndtechnosoft_employees.findUnique({ where: { id } });

// ALWAYS — scope every query to the server-resolved tenantId
prisma.rndtechnosoft_employees.findFirst({
  where: { id, tenant_id: ctx.tenantId },
});
```

- Every query on a tenant-owned table MUST include `tenant_id` in the `where` clause.
- Every write referencing another tenant-owned entity must verify it belongs to the same tenant first.
- Never trust `req.body.tenantId` or `req.query.tenantId` for authorization.

### Authorization
- All permission checks are server-side in guards or services. UI hiding is cosmetic only.
- Sensitive actions (salary view/edit, payroll finalize, payment execute, bank update) require explicit RBAC permission checks.
- Never trust `role` or `permissions` values sent from the browser.

### Input Validation
- Every endpoint has a typed DTO with `class-validator` decorators.
- Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` is active — rely on it.
- Validate enums/statuses explicitly.
- File uploads: validate MIME type, size, extension on the server — never trust browser `Content-Type`.

### Secrets & Sensitive Data
- `JWT_SECRET`, `DATABASE_URL*` — never log, never return to client.
- Bank account numbers, PAN/Aadhaar, UAN — stored in `_encrypted` columns; return only `_last4` in responses.
- Sensitive fields must never appear in logger calls or structured log payloads.
- Audit log `old_values`/`new_values` snapshots — mask sensitive fields before storing.

### Injection
- Prisma parameterizes all queries. If you ever use `$queryRaw`, use `Prisma.sql` tagged templates ONLY.
- Never concatenate user input into any query string.

---

## 4. Domain Invariants

### Money — Always Use Decimal
```typescript
// NEVER
const total = amount1 + amount2; // JS float

// ALWAYS — Prisma returns Decimal objects; keep them as Decimal throughout
import { Decimal } from '@prisma/client/runtime/library';
const total = new Decimal(amount1).plus(new Decimal(amount2));
```

### Finalized Payroll is Immutable
- Once a payroll run is `FINALIZED`, its payslip lines, run employee records, and payment records MUST NOT be mutated.
- Post-finalization corrections go through a new correction run — never overwrite history.

### Effective-Dated Records (Close-and-Insert Pattern)
These tables use `effective_from / effective_to`; always close the old row and insert a new one:
- `employee_salary_assignments`
- `employee_salary_component_values`
- `employee_employments`
- `employee_reporting_lines`
- `employee_shift_assignments`
- `employee_leave_policy_assignments`
- `employee_bank_accounts`
- `employee_statutory_enrollments`

```typescript
// WRONG — mutates history
await prisma.rndtechnosoft_employee_salary_assignments.update({
  where: { id: existingId },
  data: { annual_ctc: newAmount },
});

// CORRECT — close old, insert new in one transaction
await prisma.$transaction([
  prisma.rndtechnosoft_employee_salary_assignments.update({
    where: { id: existingId },
    data: { effective_to: today, assignment_status: 'CLOSED' },
  }),
  prisma.rndtechnosoft_employee_salary_assignments.create({
    data: { ...newRecord, effective_from: today, effective_to: null },
  }),
]);
```

### Status Transitions — Use Action Endpoints
```
POST /payroll-runs/:id/calculate
POST /payroll-runs/:id/approve
POST /payroll-runs/:id/finalize
```
Never accept a raw `{ status: "FINALIZED" }` PATCH. Validate the current state before transitioning.

### Attendance
- Source punches (`attendance_punches`) are immutable — raw events only.
- Daily results live in `attendance_records` — the calculated interpretation.
- Attendance calculation MUST use the shift effective on the attendance DATE, not the current shift.

---

## 5. Dependency Management

### Before Adding Any Package
1. Can stdlib or existing code solve it?
2. Does an already-installed package already provide it?
3. Is it actively maintained? (check npm last-publish date)
4. Run `npm audit` before and after adding.
5. Does it meaningfully reduce complexity vs. writing ~10–30 lines?

### Existing Key Dependencies — Do NOT Duplicate
**Backend**: `@nestjs/*`, `@prisma/client`, `class-validator`, `class-transformer`, `rxjs`
**Frontend**: `react`, `react-dom`, `tailwindcss`, `tailwind-merge`, `clsx`, `lucide-react`, `recharts`, `xlsx`, `vite`, `typescript`

### Prohibited Without Discussion
- Second ORM/query builder alongside Prisma
- Second HTTP client alongside fetch
- Lodash (use native ES2022+)
- Moment.js (use `Intl` or `date-fns` only if already present)
- Any package with known CVEs

---

## 6. Code Standards

### TypeScript
- `strict: true` is active. Honour it.
- Model domain state with discriminated unions; avoid raw string literals for status fields in business logic.
- Use `unknown` at untrusted API boundaries and narrow before use.
- No `// @ts-ignore` without a detailed justification comment.

### NestJS Patterns
```typescript
// Controller → Service → PrismaService (no repository layer)
// Services throw HttpException subclasses for expected business errors
// Controllers are thin: parse DTO → call service → return response

@Injectable()
export class ExampleService {
  constructor(private readonly prisma: PrismaService) {}

  async doSomething(tenantId: string, dto: CreateExampleDto) {
    // 1. Validate business preconditions
    // 2. Scope queries by tenantId
    // 3. Write in a transaction if multiple records change
    // 4. Write audit log for significant changes
    // 5. Return a shaped DTO — never a raw Prisma model
  }
}
```

### Prisma Patterns
- `select` only required fields in list queries.
- `findFirst` (not `findUnique`) when you need tenant-scoping.
- `prisma.$transaction()` for multi-step writes.
- Always enforce `take` + `skip` on list queries. Max `take: 100` unless the endpoint is explicitly designed for larger exports.

### Error Handling
```typescript
// Expected business errors — typed HttpException
throw new BadRequestException('Salary assignment overlap detected for this effective period');
throw new ForbiddenException('You do not have permission to finalize payroll');
throw new NotFoundException(`Employee ${id} not found in this tenant`);

// NEVER
// catch(e) { return null; }           ← silently swallows
// catch(e) { return { ok: false }; }  ← hides failure type
```

### Frontend
- All API calls go through `src/api/` typed functions — no inline `fetch` in components.
- TailwindCSS for styles; use `clsx` + `tailwind-merge` for conditional classes.
- Format financial values with `Intl.NumberFormat` using tenant currency — never raw numbers.
- Mask sensitive values in UI: bank account shown as `****1234` only.
- No `console.log` in committed code.

---

## 7. Testing — What to Write and When

### For Every New Feature or Bug Fix

#### Service-Level Unit Tests
```
- Happy path
- Wrong tenantId returns null/throws (tenant isolation)
- Each expected business error condition
- State transition guards (e.g., cannot finalize an already-finalized run)
- Decimal arithmetic edge cases for any financial calculation
```

#### Key Domain Test Cases
| Domain | Must Test |
|---|---|
| Payroll calc | Multiple components sum to gross; deductions sum correctly; Decimal precision maintained |
| Attendance | Cross-midnight shifts; missing punch; manual adjustment approval flow |
| Leave | Balance deduction; half-day; date-overlap rejection |
| Salary | Effective-date overlap prevention; close-and-insert produces correct current record |
| Auth | Invalid token rejected; wrong tenant member rejected; expired token rejected |

#### What to Mock
- `PrismaService` — mock at method level with `jest.fn()`.
- External API integrations — always mock in unit tests.
- `Date.now()` — pin in any test involving effective dates.

### Testing Checklist Before Marking Done
- [ ] Happy path passes
- [ ] Wrong tenantId returns 403/404 (no cross-tenant leak)
- [ ] Missing entity returns descriptive error
- [ ] Invalid state transition is rejected with correct message
- [ ] Financial totals verified (sum of components = total)
- [ ] Decimal precision maintained (no float drift)

---

## 8. Scalability — Think at 100× Load

### Database
- All new query patterns must use an existing index or propose a new one.
- Enforce `take` limits — no unbounded `findMany`.
- `select` only needed columns.
- Bulk operations: use `createMany`/`updateMany` or batched transactions, not N individual queries.

### API Design
- Large reports/exports: queue asynchronously, return job ID, poll for completion.
- Payroll calculation for large tenants: must not block the HTTP thread beyond ~10 seconds — use background jobs.
- Rate-limit: auth endpoints, payroll finalize, bulk operations.

### Frontend
- All tables paginate server-side — never load all records and paginate in memory.
- `useMemo` for expensive computations in payroll/salary views.
- Code-split heavy views with `React.lazy`.

### Caching Rules
- Never cache a response without tenant scope in the cache key.
- PII/salary data must not be stored in shared or public caches.
- Always set explicit TTLs and invalidate on write.

---

## 9. Audit Log Pattern

Write an audit log for:
- Salary assignment create/update
- Bank account create/update/deactivate
- Employee identifier (PAN/Aadhaar) changes
- Payroll run state transitions
- Role/permission changes
- Attendance manual adjustment approval
- Leave approval/rejection
- Payment state changes

```typescript
await this.auditService.log({
  tenantId,
  actorTenantMemberId: currentMemberId,
  actionCode: 'SALARY_ASSIGNMENT_CREATED',
  entityType: 'employee_salary_assignment',
  entityId: newAssignment.id,
  newValues: {
    annual_ctc: newAssignment.annual_ctc.toString(), // Decimal → string for JSON
    effective_from: newAssignment.effective_from,
  },
});
```

---

## 10. Definition of Done — SDE-3 Standard

Do not claim done until you have actually run these:

| Check | How to Verify |
|---|---|
| TypeScript compiles | `cd backend && npx tsc --noEmit` |
| Backend starts without errors | `npm run dev` and observe logs |
| Frontend builds | `cd frontend && npm run build` |
| No stray `console.log` | `grep -r "console.log" backend/src/` |
| No hardcoded secrets | Review any new env references |
| Tenant scope in all new Prisma queries | Code review every new `findFirst`/`findMany`/`update`/`delete` |
| Audit log written for significant actions | Confirmed in code path |
| Migration is safe (if schema changed) | `prisma migrate dev` succeeds |
| All UI states exist | Loading, empty, error, success, disabled |
| Mobile layout works | Tested at 375px |
| Sensitive values masked in UI | `****1234` pattern for account numbers |

---

## 11. Anti-Pattern Reference

| Anti-Pattern | Why Wrong |
|---|---|
| `findUnique({ where: { id } })` on tenant table | Cross-tenant data leak |
| `parseFloat(salary)` or `a + b` for money | Float corruption of financial data |
| Updating payslip lines on finalized run | Destroys audit trail |
| `PATCH /entity/:id { status: "FINALIZED" }` | Bypasses state machine |
| Returning raw Prisma model from controller | Leaks schema, may expose sensitive fields |
| `catch(e) { return null }` | Hides failures |
| `req.body.tenantId` for tenant resolution | Client impersonation |
| `console.log(employee)` in service | Logs PII |
| Adding `basic_salary` column to employees table | Breaks data-driven salary model |
| `findMany({})` without `take` | Unbounded query |

---

## 12. Key File Locations

| What | Path |
|---|---|
| DB Schema (source of truth) | `backend/prisma/schema.prisma` |
| App bootstrap & global pipes | `backend/src/main.ts` |
| Root module | `backend/src/app.module.ts` |
| Tenant middleware | `backend/src/common/middleware/tenant-context.middleware.ts` |
| Tenant guard | `backend/src/common/guards/tenant.guard.ts` |
| Global exception filter | `backend/src/common/filters/all-exceptions.filter.ts` |
| Payroll service | `backend/src/modules/payroll/payroll.service.ts` |
| Auth service | `backend/src/modules/auth/auth.service.ts` |
| Frontend API layer | `frontend/src/api/` |
| Frontend types | `frontend/src/types/` |
| Master architecture doc | `00_VOOGYO_MASTER_PROJECT_ARCHITECTURE.md` |
