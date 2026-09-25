This covers every task in this conversation up to now. The platform HQ task is still in progress, so its section separates what's done from what isn't and flags what is currently broken. I can't write files from here; save it as something like `docs/LLM_CONTEXT.md`.

```markdown
# Voogyo Payroll/HRMS SaaS: LLM context handoff
Repo: /home/bhavin-pathak/project/payroll (git repo; NOTHING committed by the assistant).
Snapshot date: 2026-09-24.

## 0. Stack and ground rules
- **Backend:** NestJS 12 (`backend/`, ESM-aware Jest with `maxWorkers: 1`) on port 4000, Prisma 5.22, PostgreSQL 16. Tables are `rndtechnosoft_*`, with `tenant_id` and composite `(tenant_id, id)` keys.
- **Frontend:** two Vite/React/Tailwind apps in `frontend/`.
  - Tenant app: `index.html` / `src/main.tsx`, port 3000.
  - Platform HQ portal (Super Admin): `superadmin.html` / `src/superadmin/main.tsx`, port 3100, config `vite.superadmin.config.ts`.
- **Project rules:** AGENTS.md and the user's CLAUDE.md.
  - Surgical changes; no fake data; server-side authorization; tenant isolation.
  - Paginate lists; decimal-safe money; audit sensitive actions; WCAG-minded UI.
- **User preferences (saved as memories):**
  - Never read values from `.env` files, not even DB hostnames; listing variable names is the most allowed.
  - The user restarts the backend (`nest start`, :4000) and the Vite servers (:3000, :3100) themselves. Never kill them or write into `backend/dist`. For live checks, use a separate port or instance.
- **Migrations:**
  - Generate from source where possible.
  - Drift-check with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <throwaway DB>`.
  - Throwaway DBs are named `payroll_shadow_check_<digits>` and are created and dropped via a scratchpad helper.
  - Never use a real DB as the shadow.
- **Backend test command:** `npm test` (sets `NODE_OPTIONS=--experimental-vm-modules`). Frontend: `npx vitest run`.
- **Typecheck:** `npx tsc --noEmit -p tsconfig.json` in both packages.
- **Builds (to scratch, not tracked dist):**
  - Backend: `npx tsc -p tsconfig.build.json --outDir <scratch>`.
  - Frontend: `npx vite build --outDir <scratch>` and `npx vite build --config vite.superadmin.config.ts --outDir <scratch>`.

## 1. Earlier work (before the Super Admin tasks), all done

### 1.1 Attendance (COSEC)
- Dynamic punches, with no fabricated IN/OUT labels.
- Raw data is preserved. Shift timing comes from COSEC `attendance-daily` (SCHEDULESHIFT/SHIFTSTART/SHIFTEND). Migration: `20260923120000_attendance_scheduled_shift`.
- Files:
  - Backend: `cosec.serializer.ts`, `external-api.service.ts`, `attendance.service.ts`.
  - Frontend: `views/attendance/shared/{punches.ts, PunchTimeline.tsx, DayDetail.tsx, shift.ts}`.

### 1.2 Organization and tenant settings audit
- The tenant is always derived from the session (opaque token, SHA-256 hashed, `user_sessions` table).
- SMTP/WhatsApp secrets are encrypted with AES-256-GCM (`platform-crypto.util`, `PLATFORM_ENCRYPTION_KEY`) and are write-only.
- Settings are merged with `jsonb ||`.
- Migration: `20260923150000_tenant_access_control`, which adds CHECK constraints on membership/role status and a partial unique index on role names.

### 1.3 Owner access
- The canonical owner role is `ADMIN_ROLE_CODE='ADMIN'`, holding every permission as `role_permissions` rows. No role-name checks anywhere.
- Migration: `20260923170000_owner_role_permissions`.

### 1.4 RBAC over every sidebar item
Single source of truth: `backend/src/common/access/access-catalog.ts`.
- **Catalog contents:**
  - `MODULES`: CRM, HRMS, FINANCE (FINANCE requires HRMS).
  - `NAVIGATION` tree: `{id, label, module, parent}`.
  - `PERMISSIONS`: `{key, name, section, group, nav}`, now 92 keys, including `attendance.approve`.
  - `DEFAULT_ROLE_PERMISSIONS`, `resolveModuleStates`, `resolveNavigation` (returns id, label, parent, module, moduleName, moduleEnabled), `groupPermissionCatalog`, `permissionModule`, `moduleFeatures`.
  - `moduleCapabilities` (added in section 3).
- **Guards:** global APP_GUARD order is TenantAuthGuard → PermissionsGuard → ModuleAccessGuard.
  - ModuleAccessGuard derives the required module from the route's `@RequirePermissions` keys through the catalog. The `@RequireModule` decorator was removed.
- **Escalation rule:** `AccessService.assertHoldsAll` (you can't grant permissions you don't hold).
- **Frontend:**
  - `AuthContext` (`can`, `canOpen`, `navigationEntry`, `navigation`, `completeAccess`, which requires navigation labels).
  - Sidebar built from the server tree via `components/layout/navigation.ts` (`NAV_PRESENTATION`, `VIEW_NAVIGATION`, `sidebarTree`, `currentNavigationId`).
- **Migrations:**
  - `20260923190000_sidebar_module_permissions`
  - `20260923210000_business_modules` (PAYROLL merged into FINANCE; `module_code` records the owning module)
  - `20260923220000_attendance_approve_permission`
- **Sidebar result:** HRMS › People, Attendance; Finance › Payroll, Payslips, Bookkeeping. Reports stays top-level under FINANCE; Compliance stays top-level under HRMS.

## 2. Task 7: Super Admin Tenant Workspaces and User Management (done and verified)

### Backend
- **`super-admin/platform-directory.service.ts`**
  - **Tenant list** (`GET super-admin/tenants`):
    - Raw SQL with LATERAL joins; server-side search, filters and sort.
    - Owner = the earliest-joined ACTIVE member holding the ADMIN role, the same rule as the tenant settings page.
    - Filters: status, plan, subscriptionStatus, module on/off, created range.
  - **Tenant detail** (`GET tenants/:id`):
    - overview, organization (reuses `OrganizationSettingsService.getSettings`, which returns no secrets), owner, users counts, roles (kind OWNER/BUILT_IN/CUSTOM, member and permission counts), modules, and health (configuration checklist, last activity from `user_sessions.last_used_at`).
  - **Other tenant routes:** activity (`GET tenants/:id/activity`), plus `POST tenants/:id/suspend|reactivate` (conditional update, audited in `platform_activity_logs`).
  - **User list** (`GET users`): one row per global user, with all memberships as JSON.
    - Filters: tenantId, roleCode, accountStatus, membershipStatus.
  - **User routes:** `GET users/role-options`, `GET users/:id` (identity, memberships, sessions without token hashes, activity, security events).
  - **Account actions:** `POST users/:id/disable|enable` act on the global `user_status`, revoke sessions, leave memberships alone, and are audited.
- **DTOs:** `super-admin/dto/platform-directory.dto.ts`: PageQueryDto, TenantListQueryDto, UserListQueryDto, RoleOptionsQueryDto, DomainListQueryDto (added later).
- **Guard:** `SuperAdminAuthGuard` now also requires `role === 'SUPER_ADMIN'` (`PLATFORM_CONSOLE_ROLE`); anything else gets 403. Tenant tokens get 401 on all `/super-admin/*` routes.
- **Removed fake endpoints:** `registered-users`, `invited-users`, `impersonate`, and the `PUT tenants/:id/status` any-string endpoint.
- **Provisioning:** the temporary password is now hashed with scrypt, and the admin id is recorded.
- **`TenantsModule`:** exports `OrganizationSettingsService`. `SuperAdminModule` imports TenantsModule and ExternalApiModule.
- **Migration `20260924090000_platform_directory_indexes`:**
  - `pg_trgm` GIN search indexes: `lower(display_name||' '||legal_name||' '||tenant_code)` on tenants, and `lower(coalesce(display_name,'')||' '||email||' '||coalesce(mobile_number,''))` on users.
  - `created_at DESC` indexes.
  - `user_sessions (tenant_id|user_id, last_used_at DESC)`.
  - `platform_activity_logs (target_tenant_id, created_at DESC)`, plus a partial index on `(metadata->>'userId')`.
  - `audit_logs (actor_user_id, occurred_at DESC)` and `crm_audit_logs (actor_id, created_at DESC)`.
  - Matching `@@index` entries were added to `schema.prisma`.

### Frontend (portal)
- **Scroll fix:** `index.css` has `body.platform-portal {height:auto; min-height:100%; overflow-y:auto}`, and `superadmin.html` sets `<body class="platform-portal …">`. The console shell has a sticky `h-16` header and a sticky, self-scrolling sidebar (`lg:h-[calc(100dvh-4rem)]`). Verified in headless Chrome at 1366×768 and 125% zoom.
- **New views** (`src/superadmin/views`): TenantDirectoryView (rewritten), TenantDetailView, UserDirectoryView, UserDetailView, UserTable.
- **Shared components:** `src/superadmin/components/{ConfirmDialog, Pagination, StatusBadge, DetailList(Value/DetailList/DetailItem/Panel/ErrorBanner)}`.
- **Helpers:**
  - `src/superadmin/format.ts`: dates, relative time, user-agent summary, initials, humanize, localDayStart/End, seatUsage.
  - `src/superadmin/hash-route.ts`: routes shaped `#section/id`, and `useHashRouteId`.
  - `src/superadmin/api/platform-directory.api.ts`: types plus `platformDirectoryApi`.
- **Deleted:** `components/super-admin/SmartUserManagementView.tsx` (hardcoded users and telemetry) and `superadmin/tenant-app-url.ts` (along with `VITE_TENANT_APP_URL`). `PLATFORM_PORTAL.md` still mentions that variable, so the doc is stale.
- **Vite fix:** `vite.superadmin.config.ts` now sets `cacheDir: 'node_modules/.vite-superadmin'`, because the shared cache caused 504 "Outdated Optimize Dep" errors.
- **Tests:**
  - Backend: `test/platform-directory.spec.ts` (23 tests).
  - Frontend: `superadmin/format.test.ts`, `superadmin/directory-sources.test.ts` (no sample data in the directory screens).

## 3. Task 8: Platform HQ production readiness (IN PROGRESS)

### 3.1 Infrastructure findings
Sources: public probes plus the old repo `/home/bhavin-pathak/project/voogyo-erp`. No VPS access.
- **DNS:** GoDaddy (`ns13/ns14.domaincontrol.com`).
  - A wildcard record exists: `*.voogyo.com` → 187.127.187.111, the same as the apex. `www` is a CNAME to the apex.
  - MX is Zoho. There is no CAA record.
- **TLS:** a Let's Encrypt wildcard certificate (issuer YE2), SAN `voogyo.com, *.voogyo.com`, valid Jul 27 → **Oct 25 2026**.
  - Wildcards require DNS-01 validation. Whether renewal is automated is unknown (GoDaddy's API access is restricted).
- **Server:** nginx/1.24.0 (Ubuntu). Production currently serves the **earlier Next.js voogyo-erp** app on all hosts; subdomains redirect 307 to `/login`.
- **Old handbook** (`voogyo-erp/docs/VOOGYO_DEPLOYMENT_AND_WORKFLOW_GUIDE.md`): PM2 and `certbot --nginx` with IP 103.191.208.242. It's outdated and no longer matches live DNS.
- **This repo has no deployment config.**
- **Backend env var names:** NODE_ENV, PORT, DATABASE_URL, JWT_SECRET, DATABASE_URL_REAL, PLATFORM_ENCRYPTION_KEY.
  - New, still to document in `.env.example`: `PLATFORM_BASE_DOMAIN`, `PLATFORM_PUBLIC_IPS` (comma list), `PLATFORM_DOMAIN_CHECKS=off`.
- **Other notes:** CORS reflects any origin (`origin: true`); there is no `trust proxy`; the client IP is parsed from X-Forwarded-For.

### 3.2 Data-model facts (reported to the user)
- **Membership removal is a soft delete:** `membership_status` becomes ARCHIVED with `archived_at` set; the global user is untouched and a MEMBER_REMOVED audit row is written. Re-adding a member reactivates the same row and clears `archived_at`.
- **Seats:** no limit is enforced anywhere. The single seat rule is `backend/src/common/tenancy/seats.ts` (`SEAT_MEMBERSHIP_STATUSES = ['ACTIVE','SUSPENDED']`), used by org settings, the directory and the Command Centre.
- **Missing features:** no 2FA for workspace users; no invitation system (`invited_at` is never written); no geolocation. Plans, subscriptions, invoices, coupons, tickets and modules tables are all empty. `platform_settings` holds only `platform_branding` and `saas_packages`.

### 3.3 Done in Task 8
**Theme (portal only; separate from the tenant theme)**
- **Tokens:** `frontend/src/index.css` defines `:root[data-hq-theme='light'|'dark']` CSS variables `--hq-*` as RGB channels:
  - background, foreground, card, card-foreground, popover, muted, muted-foreground, subtle-foreground, border, input, ring;
  - accent (+foreground), secondary (+foreground), primary (+hover, +foreground), link;
  - destructive (+hover, +foreground), danger, success, warning, info, neutral, overlay, chart-1…5.
- **Tailwind:** `frontend/tailwind.config.js` maps these to `hq-*` colours (`rgb(var(--hq-x) / <alpha-value>)`).
- **Pre-paint:** `frontend/public/hq-theme.js` applies the saved theme before first paint (the CSP forbids inline scripts) and is loaded in `superadmin.html`. `main.tsx` no longer forces the `dark` class.
- **Provider:** `src/superadmin/theme/PlatformThemeContext.tsx`:
  - localStorage key `voogyo_platform_theme`;
  - light/dark/system (default system), following `matchMedia` while on system;
  - sets `data-hq-theme` on `<html>`.
- **Switch:** `src/superadmin/theme/ThemeSwitch.tsx` (a radiogroup), placed in the console header and on the login and MFA pages. The provider wraps `PlatformApp`.
- **Converted to tokens:** every file in `src/superadmin/views/*` and `src/superadmin/components/*`, via the scratchpad script `hq_tokens.py`.
- **Not converted yet:** the legacy `components/super-admin/*` screens.

**Backend: Command Centre and governance**
- **`platform-command-centre.service.ts`** (`GET super-admin/command-centre`) reports real counts only:
  - workspaces by status, newest, created in the last 30 days;
  - people (accounts and memberships by status);
  - activity: active users 24h/7d/30d, sign-ins, live sessions;
  - seats, growth (new members in 30 days per workspace), subscriptions (renewals due in 14 days);
  - billing (invoice counts and currency sums as decimal strings), support, platform security;
  - recent platform activity;
  - an `unavailable[]` list with reasons: MRR/ARR, paid workspaces, churn, failed payments, AI tokens, WhatsApp, email, storage, API hits, visitors, marketplace, uptime.
- **`platform-governance.service.ts`:**
  - `listSubscriptions` (paginated) and `billingSummary` (plans, statuses, totals by currency, coupons, `paymentGatewayConfigured` boolean only).
  - `securityOverview`: platform accounts without secrets, MFA status, sessions, failed sign-ins, workspace lockouts, recent SECURITY/AUTH events, `encryptionConfigured`.
  - `roleTemplates`: from `DEFAULT_ROLE_PERMISSIONS`, catalog groups and workspace usage.
  - `getBranding`/`saveBranding`, audited.
- **DTOs:**
  - `dto/platform-settings.dto.ts`: BrandingDto, WebsiteSettingsDto, CreateCouponDto (percentage ≤ 100 enforced in the service), ActivityQueryDto, StatusPageQueryDto.
  - `dto/provision-tenant.dto.ts`: ProvisionTenantDto (validated) and ChangeSubdomainDto.
- **`super-admin.service.ts` trimmed** to: getMe, createTenant (assigns subdomain, scrypt temp password), updateTenantQuotas, getWorkspaceAdmins, getPackages (stored only, `{packages, updatedAt}`), getActivityLogs (paginated plus categories), get/saveWebsiteSettings (no fake defaults, audited), getPlatformInvoices (paginated, decimal strings), getCoupons (mapped) / createCoupon (audited), getSupportTickets (paginated).
- **Current platform routes** (`super-admin.controller.ts`):
  - `auth/*`, `command-centre`
  - `tenants` (list, filter-options, :id, :id/activity, POST, :id/suspend, :id/reactivate, `PUT :id/subdomain`, `PUT :id/quotas`)
  - `users` (list, role-options, :id, :id/disable, :id/enable), `workspace-admins`
  - `domains` (GET, plus `POST domains/:id/verify`)
  - `billing`, `subscriptions`, `packages` (GET only), `invoices`, `coupons` (GET/POST)
  - `activity`, `support`, `security`, `roles-templates`
  - `settings/branding` (GET/PUT), `settings/website` (GET/PUT), `profile`
- **Removed:** dashboard, analytics/overview, the old fake domains, transactions, packages POST/PUT/DELETE, settings (all rows), settings/razorpay, forms, ai-assistant.
- **Tenant list additions:** membership breakdown `members:{current, active, suspended, removed, allTime, accountsDisabled}`, plus `subdomain`, `address` and `addressStatus`. Search also matches the subdomain.
- **Tenant detail additions:** `overview.subdomain`, `address`, `addressProvisioning`, and `modules[].capabilities` (catalog groups; HRMS = People, Attendance, Leave, Biometric device (COSEC), Compliance).

**Backend: workspace subdomains and hostname tenancy**
- **`common/tenancy/subdomain.ts`:**
  - `RESERVED_SUBDOMAINS` (platform, mail/DNS, infra and product names, e.g. www, app, admin, superadmin, hq, api, erp, dev, new, cname, ssl, domainkey, mail, support, status, billing, static…).
  - `normalizeSubdomain`, `subdomainProblem`, `hostnameOf`, and `positionOf` (apex / subdomain / nested / foreign).
- **Table `rndtechnosoft_tenant_domains`** (migration `20260924120000_tenant_domains`):
  - Columns: kind SUBDOMAIN|CUSTOM, `subdomain` (unique), `custom_hostname` (unique, lower-case), `is_primary` (one per tenant via a partial unique index), provisioning_status PENDING|PROVISIONING|ACTIVE|FAILED, provisioning_error, attempts, last_checked_at, verified_at.
  - CHECKs cover the label format and the kind/shape.
  - Backfill: acme-in, co-0970, kpmg, rnd-in (all PENDING); reserved, duplicate or short codes fall back to `ws-<id>`.
  - Prisma client regenerated.
- **`modules/tenancy/`** (a global `TenancyModule`, registered in AppModule):
  - **`TenantDomainsService`:**
    - `platformBaseDomain()` reads `PLATFORM_BASE_DOMAIN`; `addressOf`, `availability`.
    - `assignPrimarySubdomain(tx, tenantId, {requested?, derivedFrom})`: strict when requested; otherwise derived with a `-2…` suffix (a `workspace-N` stem if the code is reserved).
    - `changePrimarySubdomain` resets the address to PENDING.
    - `resolveHost` returns unconfigured | platform | tenant | unknown | foreign, with a 30-second cache.
    - `assertSessionFitsHost`: unknown → 404; foreign → 421; a session for another tenant → 403.
    - `tenantForSignIn`, `assertCanRegisterHere`.
  - **`DomainProvisioningService`:**
    - `verify(domainId)`: claims the row, then does a DNS lookup (optionally matching `PLATFORM_PUBLIC_IPS`) and an HTTPS GET of `https://<host>/api/v1/health` expecting `{status:'ok'}`. Result is ACTIVE or FAILED with a sanitised reason.
    - A background `checkDue` loop runs every 5 minutes with backoff, only when a base domain is set, `NODE_ENV!=='test'` and `PLATFORM_DOMAIN_CHECKS!=='off'`.
    - No shell execution. The make_interval bigint bug was fixed with `::int`.
- **Enforcement:**
  - `TenantAuthGuard` asserts the session fits the host: the hostname narrows access and never grants it.
  - `AuthController`:
    - register is refused on tenant/unknown hosts (400) and foreign hosts (421);
    - login uses `tenantForSignIn` (a tenant host forces that tenant, and membership is still required);
    - `switch-tenant` is refused on another workspace's host;
    - new public routes `GET auth/host` (baseDomain, kind, workspace name/status) and `GET auth/subdomain-availability`.
  - `RegisterTenantDto` accepts an optional `subdomain`, and `AuthService.registerTenant` assigns it in the same transaction.
- **Directory:**
  - `listDomains` (paginated with search and status).
  - `changeSubdomain` (audited `TENANT_SUBDOMAIN_CHANGED`).
  - `verifyDomain` (audited `TENANT_DOMAIN_VERIFIED`).

**Tests added or updated**
- `test/subdomain.spec.ts` (5).
- `test/workspace-hosts.spec.ts` (20, passing): registration unique/derived/suffixed/reserved/invalid/duplicate; sign-in binding; Host manipulation (other workspace, unknown, foreign, lookalike, nested, case and port); header tenant-id ignored; switching; `/auth/host`; availability; Super Admin subdomain change/reserved/duplicate; domain list; verify (FAILED with a DNS reason); tenant tokens get 401.
- `tenant-guard-coverage.spec.ts`: new public routes allow-listed.
- `platform-directory.spec.ts`: new `members` shape; teardown now deletes `tenant_domains`.
- `organization-settings.spec.ts` teardown: deletes `tenant_domains` before tenants. This bug leaked 10 test tenants; they were removed.
- Last full backend run: 194 passing, before `subdomain.spec` and `workspace-hosts.spec` were added. Those two pass individually; the full suite hasn't been rerun with them.

### 3.4 NOT done yet / currently broken (important)
- **Legacy portal screens are broken.** The files in `frontend/src/components/super-admin/*` call removed or reshaped endpoints and still hold fake data and hardcoded colours:
  - ExecutiveDashboardView (Command Centre), SuperAdminAiAssistantView, DomainSubdomainManagerView, TenantRolesBuilderView;
  - PlatformBillingCenterView and PaymentGatewayView (Billing and Subscriptions), TenantInvoicesView and InvoiceDetailModal, TenantTransactionsView;
  - PackagesManagerView, CouponManagementView, WebsiteCmsSeoView, WebsiteFormBuilderView, WebsiteSeoAnalyticsView;
  - PlatformActivityCenterView, PlatformSupportCenterView, PlatformAuditSecurityView, GlobalSettingsCenterView, SuperAdminProfileView;
  - PlatformSettingsView and WebsiteCmsManagerView (unused).

  **Plan:** replace each with a compact, token-themed, honest view under `src/superadmin/views/` wired to the routes above, with "Not available" states where no data exists. Then delete the legacy files and update the `PlatformConsoleView` `renderTab`.
- **Directory frontend is out of date:**
  - `TenantDirectoryView` and `platform-directory.api.ts` types still expect `members.total`; the shape is now `current/allTime/...`. Add columns for inactive/removed counts, subdomain/address/status and a Subscription section.
  - Add a membership-status filter to the tenant detail Members tab, and capabilities to the Modules tab.
  - Add a Domains UI (change and verify).
- **Tenant app:** registration form (`views/AuthView.tsx`) needs an optional "Workspace address" field using `GET auth/subdomain-availability` and `auth/host`; the workspace switcher should redirect to the other workspace's address when on a tenant host.
- **Tests still to write:**
  - Backend `platform-governance` spec: command-centre shape and "no invented numbers", security has no secrets, role templates, billing, branding/website validation (restore originals), coupon validation and cleanup, removed routes return 404, tenant token gets 401.
  - Frontend theme tests: persistence, `resolveTheme`, every portal page uses tokens, no raw colours or fake data across all portal files.
- **Docs:** update `PLATFORM_PORTAL.md` (remove `VITE_TENANT_APP_URL`, document the new env vars) and `.env.example`.
- **Infra deployment plan** still to write, and nothing to be executed without approval:
  - which hosts go to this app versus the Next.js app;
  - nginx `server_name *.voogyo.com` with `proxy_set_header Host $host`, `/api` → Nest :4000, static tenant dist; `admin.voogyo.com` → portal dist;
  - automated DNS-01 renewal before Oct 25 (GoDaddy API limits; Cloudflare DNS or acme-dns alias as options);
  - `trust proxy`, CORS allowlist, HSTS, the PM2/systemd unit;
  - setting `PLATFORM_BASE_DOMAIN=voogyo.com` and `PLATFORM_PUBLIC_IPS=187.127.187.111`.
- **Restarts:** after this work the user must restart the :4000 backend (Prisma client regenerated, new module and routes) and the Vite servers.
- **Git state:**
  - Nothing committed by the assistant.
  - Pre-existing staged changes, not the assistant's: deletion of `frontend/src/api/super-admin.api.ts` and the rename `types/super-admin.types.ts` → `superadmin/platform.types.ts`.
  - The two deletions from Task 7 are unstaged.

## 4. Flagged issues, not fixed
- **Leftover test accounts:** `tenant-b-admin@voogyo.test` is an ACTIVE ADMIN in the real ACME_IN workspace, and other `*@voogyo.test` accounts hold removed memberships in RND_IN. Review and disable.
- **RND EMPLOYEE role:** it was granted extra permissions (including modules.update) via the UI.
- **Plaintext data:** the COSEC password and bank numbers (`ENC[...]`) are stored in plaintext.
- **Fabrication elsewhere:** the attendance sync invents 480 minutes; PayrollContext invents 27 days on failure; the tenant Dashboard, Payslips and Reports pages use mock data.
- **Payroll UI:** client-side only.
- **Seed/demo endpoints:** exist in production code.
- **Platform accounts:** have no MFA enabled (1 account: `superadmin@voogyo.com`).
- **Wildcard certificate:** expires Oct 25 2026; renewal method unverified.
```