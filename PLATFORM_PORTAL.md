# Platform (Super Admin) Portal

The platform portal is a **separate application** from the tenant workspace. It has its
own URL, its own sign-in, its own accounts and its own session. A tenant workspace
login can never reach it, and a platform login is not a tenant member.

## URLs

| Application | Development | Build output |
| --- | --- | --- |
| Tenant workspace | `http://localhost:3000` | `frontend/dist` |
| Platform portal | `http://localhost:3100` | `frontend/dist-superadmin` |
| Platform API | `http://localhost:4000/api/v1/super-admin/*` | — |

In production, serve `dist-superadmin` from a host of its own, for example
`admin.voogyo.com`, so the portal is not reachable from the tenant domain.

## Running it

```bash
# Backend (serves both APIs)
cd backend && npm run dev

# Tenant workspace
cd frontend && npm run dev

# Platform portal
cd frontend && npm run dev:superadmin
```

Point the portal at a backend on another port with `API_PROXY_TARGET`:

```bash
API_PROXY_TARGET=http://localhost:4100 npm run dev:superadmin
```

## Theme

The portal has its own Light / Dark / System switch (header, and top right of the
sign-in screens). The choice is saved in `localStorage` under `voogyo_platform_theme`;
the tenant app keeps its theme under `voogyo_theme`, so neither affects the other.

- Colours are semantic tokens (`background`, `foreground`, `card`, `muted`, `border`,
  `input`, `ring`, `primary`, `destructive`, `success`, `warning`, `info`, `chart-1..5`…)
  defined once per theme in `src/index.css` under `:root[data-hq-theme='light'|'dark']`
  and exposed to Tailwind as `hq-*` (`bg-hq-card`, `text-hq-muted-foreground`…).
  Portal code uses only these; `directory-sources.test.ts` fails on fixed palette
  colours (`bg-slate-900`, `text-white`…) or `dark:` variants under `src/superadmin`.
- `public/hq-theme.js` applies the saved choice before the first paint. It is a file
  rather than an inline script because the CSP allows `script-src 'self'` only.
- `tokens.test.ts` checks that both themes define the same tokens and that every
  text/surface pair meets WCAG AA contrast (4.5:1).

## Workspace addresses

Every workspace gets a subdomain when it is created (sign-up or the portal). Its
address is `<subdomain>.<PLATFORM_BASE_DOMAIN>`.

| Backend variable | Meaning |
| --- | --- |
| `PLATFORM_BASE_DOMAIN` | e.g. `voogyo.com`. Unset (local development): subdomains are stored but hosts carry no meaning and nothing is checked. |
| `PLATFORM_PUBLIC_IPS` | Optional, comma-separated. When set, verification also requires the address to resolve to one of them. |
| `PLATFORM_DOMAIN_CHECKS` | `off` stops the background verification. It runs every 5 minutes only when a base domain is set and never under `NODE_ENV=test`. |

Rules:

- Lower-case letters, digits and single hyphens, 2–63 characters, no leading or
  trailing hyphen. Reserved labels (`www`, `app`, `admin`, `api`, `hq`, `mail`,
  `status`, `billing`… see `src/common/tenancy/subdomain.ts`) are refused. A unique
  index makes two workspaces racing for one address impossible.
- Without a requested subdomain, one is made from the tenant code (`ACME_IN` →
  `acme-in`), suffixed `-2`, `-3`… when taken.
- **The host only narrows access.** A request on `acme.voogyo.com` is refused unless
  the session's own membership is in that workspace; the Host header never grants
  access or selects a workspace for a session. Sign-in on a workspace address is bound
  to that workspace, and sign-up is accepted only on platform hosts (the base domain
  and reserved labels). On an unknown subdomain, sign-in and signed-in requests answer
  404; on a host outside the base domain or a nested name, 421. Public routes such as
  `/api/v1/health` answer on any host.
- Changing an address from the portal (workspace → Overview → Change address) takes
  effect at once and is audited (`TENANT_SUBDOMAIN_CHANGED`); the old address stops
  resolving to the workspace.
- Verification (PENDING → PROVISIONING → ACTIVE, or FAILED with a stored reason) looks
  up DNS and requests `https://<address>/api/v1/health`. It never runs commands or
  changes DNS, certificates or the proxy: with wildcard DNS and a wildcard certificate
  a new subdomain needs neither. Failed checks retry with backoff up to six hours;
  **Domains & DNS → Verify now** checks at once.
- The table (`rndtechnosoft_tenant_domains`) already models custom domains
  (`domain_kind = 'CUSTOM'`, `custom_hostname`); nothing issues them yet.

The backend trusts `X-Forwarded-For` only from a loopback peer (`trust proxy:
'loopback'` in `main.ts`), i.e. nginx on the same host. The address it appends is
what sign-in throttling and audit records use; whatever the caller writes is ignored.

## Provisioning a workspace

**Tenant workspaces → Provision tenant** (`#tenants/new`) collects organization,
owner, address, modules and an optional plan, shows a review, and creates everything
in one transaction: the workspace, its address, its organization profile (the same
fields the workspace edits in its own settings), module switches (Finance requires
HRMS), the owner with the workspace's built-in `ADMIN` role, the subscription if a
plan was chosen, and an onboarding record. Nothing is created if any part fails.

- **Duplicates.** Each form carries an idempotency key (unique in
  `rndtechnosoft_tenant_onboardings`). A repeated or doubled submission returns the
  workspace already created. Tenant codes and subdomains are unique in the database.
- **Owner.** A new owner account has no password. The onboarding email carries a
  one-time link `https://<address>/#setup=<token>`: the token sits in the URL fragment,
  which browsers never send to a server; only its SHA-256 digest is stored; it expires
  after 7 days and can be used once; opened at another workspace's address it is
  refused. An owner who already has a Voogyo account keeps their password.
- **Onboarding email.** Sent only after the transaction commits, and its real outcome
  is stored in `rndtechnosoft_email_deliveries`: QUEUED → SENT (the SMTP server accepted
  it) or FAILED (with a reason that names no credential). No attempt at all (no SMTP,
  or no workspace URL) is NOT_SENT. A failed email never undoes the workspace; the
  workspace page shows the status and can send it again (with a new link).
- **Plans.** Only plans stored in `rndtechnosoft_plans` can be chosen; there are none
  yet, so the step says so and the workspace is created without a subscription.
- **Not collected:** city, state and pincode (the profile has one address field), PAN
  and other registrations (no part of the application uses them yet).

## Platform email (SMTP)

**Global settings → Email (SMTP)** holds the one mail server platform email uses
(`EmailService`: onboarding now; invitations, resets and alerts can use it later).
The password is encrypted with `PLATFORM_ENCRYPTION_KEY`, never returned (only
"a password is stored"), never logged, and refused with security mode None. **Send
test email** really sends and reports SENT or FAILED from the server's answer.

## Platform DNS (GoDaddy)

**Domains & DNS** manages the zone of `PLATFORM_BASE_DOMAIN` through a `DnsProvider`
interface; `GoDaddyDnsProvider` is the only implementation today.

| Backend variable | Meaning |
| --- | --- |
| `GODADDY_API_KEY`, `GODADDY_API_SECRET` | GoDaddy API credentials. Server-side only: never sent to a browser, logged or stored. |
| `GODADDY_API_URL` | Optional. `https://api.ote-godaddy.com` for GoDaddy's test environment; the default is production. |

- Workspaces get **no DNS record of their own**: the wildcard `*.<domain>` sends every
  address to the application, which finds the workspace from the host name.
  **Point wildcard at application** sets `*` to `PLATFORM_PUBLIC_IPS`.
- A, AAAA, CNAME, MX and TXT records can be created, changed (all values of a
  type + name at once, as GoDaddy stores them) and deleted, each behind a confirmation
  naming the record. NS, SOA, SRV and CAA are read-only here.
- **Verify DNS** checks the domain and the wildcard in the provider's zone and in
  public DNS against `PLATFORM_PUBLIC_IPS`, and reports Verified only if every check
  passed.
- Every change, verification, SMTP change or test, provisioning and onboarding email
  is written to the platform activity log, without secrets or setup links.

`TENANT_APP_URL` (development only, e.g. `http://localhost:3000`) is used for links
in emails when `PLATFORM_BASE_DOMAIN` is not set; with neither, onboarding emails are
not sent because they would have no working link.

## Accounts

Platform accounts are provisioned by an operator. There is **no sign-up and no
self-service password reset** in the portal by design.

```bash
cd backend

npm run platform:admin -- list
npm run platform:admin -- create ops@voogyo.com "Ops Lead"
npm run platform:admin -- reset-password ops@voogyo.com
npm run platform:admin -- deactivate ops@voogyo.com
```

Passwords are never accepted as command arguments. A strong password is generated and
printed once. Resetting a password or deactivating an account revokes every live
session for that admin immediately.

## How authentication works

- Passwords are hashed with **scrypt** (Node standard library, no new dependency).
  Pre-existing unsalted SHA-256 hashes still verify and are transparently re-hashed to
  scrypt on the next successful sign-in.
- Sign-in issues an opaque 256-bit token. Only its SHA-256 digest is stored, so a
  database read cannot reconstruct a usable session. Sessions expire after 8 hours.
- Every route under `/api/v1/super-admin` is protected by `SuperAdminAuthGuard`.
  Only `auth/login` is public, via the `@PlatformPublic()` decorator.
- The identity comes from the validated session, never from a request header.
- Five failed attempts lock the account for 15 minutes. Sign-in responses are identical
  for an unknown address and a wrong password, and the unknown-address path performs an
  equivalent key derivation so response time does not disclose whether an account exists.
- Successes, failures, lockouts, sign-outs, password changes and tenant workspace access
  are written to `rndtechnosoft_platform_activity_logs` with the client address. Email
  addresses in failure entries are masked.

## Two-factor authentication

TOTP, the standard six-digit authenticator code, implemented over Node's crypto
module so it adds no third-party dependency. Verified against all six RFC 6238
test vectors.

- **Enrolment** happens in the portal under *My account security*. The secret is
  shown once with an `otpauth://` link, and the factor stays off until a
  generated code proves the app is configured.
- **Recovery codes**: ten single-use codes are issued on enrolment and stored only
  as SHA-256 digests. Spending one uses a conditional update, so two concurrent
  requests cannot both redeem the same code.
- **Secrets at rest** are encrypted with AES-256-GCM under `PLATFORM_ENCRYPTION_KEY`.
  A database dump alone does not yield a working second factor. Enrolment fails
  closed if that key is missing rather than storing a secret in the clear.
- **Replay**: the time step of each accepted code is recorded, so an observed code
  cannot be reused inside its 30-second window. One step of clock skew either
  side is tolerated.
- **Challenge flow**: with a factor enrolled, the password yields only a five
  minute token that the guard refuses everywhere except the challenge endpoint.
  Verifying promotes the same token to a full session.

Lost device and no recovery codes left:

```bash
cd backend
npm run platform:admin -- reset-mfa ops@voogyo.com
```

## Sign-in throttling

The per-account lockout stops one account being guessed. It does nothing against
credential stuffing, where one password is tried across many addresses. A
database-backed throttle covers that, so limits survive restarts and hold across
every application instance.

| Scope | Failures allowed | Window | Block |
| --- | --- | --- | --- |
| Per network address | 20 | 15 min | 15 min |
| Per email address | 10 | 15 min | 15 min |
| Second-factor guesses per sign-in | 5 | 10 min | 10 min |

Throttle keys hash the email, so the table holds no readable addresses. Blocked
requests return 429 with a `Retry-After` header, and the check runs before the
password is verified so a blocked caller never reaches the slow key derivation.

## Security headers

Both dev servers and the API send a Content-Security-Policy. The control that
matters is `script-src 'self'`: the production bundles contain no inline
scripts, so injected markup cannot execute. `style-src` keeps `'unsafe-inline'`
because component libraries inject style elements, and injected CSS cannot run
code.

Serve the same headers from whatever fronts the built assets:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

`connect-src 'self'` assumes the API is reverse-proxied under the same host at
`/api`. Both front ends call the API with relative paths to make that work.

## Tests

```bash
cd backend && npm test     # platform authorization, guard coverage, tenant isolation, addresses
cd frontend && npm test    # HTML sanitisation, theme, portal sources
```

- `test/workspace-hosts.spec.ts`: address allocation, reserved/invalid/duplicate
  refusal with nothing created, sign-in bound to the address, a session refused on
  another workspace's host, unknown/foreign/nested hosts, header-supplied tenant ids
  ignored, address changes and verification from the portal.
- `test/platform-governance.spec.ts`: Command Centre counts from the database and
  lists what it cannot measure, security overview without secrets, role templates,
  billing, branding, website settings, coupons, activity paging, the removed
  fabricated-data endpoints, and refusal of workspace sessions.
- `test/tenant-provisioning.spec.ts`: provisioning in one transaction, the setup link
  (once, expiring, bound to its workspace address), real delivery through a local SMTP
  server, SMTP settings without the password ever returned, failed and unconfigured
  email, resend, idempotency (including two simultaneous submissions), refusals that
  create nothing, plans and trials, the new workspace in the directory, access.
- `test/platform-dns.spec.ts`: records, the wildcard, verification, provider failures and
  access, against an in-memory provider; `test/godaddy-dns.provider.spec.ts`: GoDaddy's
  request shapes and error mapping against a local HTTP server. Nothing calls GoDaddy.
- `test/platform-directory.spec.ts`: tenant and user directories, member counts
  (active / suspended / removed) and the seat rule.
- `frontend/src/superadmin/theme/*.test.ts(x)`: theme persistence, System mode, the
  pre-paint script, token contrast.

- `test/super-admin-guard-coverage.spec.ts` reflects over the controller and fails
  the build if any route loses the guard, or if the set of public routes widens.
  Verified to catch a deliberately injected unguarded route.
- `test/platform-authorization.spec.ts` drives the real application over HTTP:
  every guarded route refuses an anonymous caller, forged and revoked and expired
  sessions are rejected, and the throttle trips.
- `test/tenant-isolation.spec.ts` covers the customer-facing API across all of
  it: unauthenticated access, per-tenant list scoping, header and query
  manipulation, workspace switching, resource id manipulation, cross-tenant
  update and delete, role separation and session lifecycle. Verified to fail
  when header trust is reintroduced and when the guard is disabled.
- `test/tenant-guard-coverage.spec.ts` pins the exact set of routes exempt from
  authentication and asserts the guard is registered globally.
- `frontend/src/utils/sanitize-html.test.ts` runs seventeen stored-XSS payloads
  through the sanitiser and checks that legitimate document formatting survives.

## Schema

`20260922090000_super_admin_portal_auth` adds:

- `rndtechnosoft_super_admin_sessions` — server-side sessions, token digest unique,
  cascade delete with the admin, `CHECK (expires_at > created_at)`.
- `rndtechnosoft_super_admins.password_algorithm`, `.failed_login_attempts`,
  `.locked_until` — with `CHECK (failed_login_attempts >= 0)`.

`20260924090000_platform_directory_indexes` adds trigram search indexes (installs
`pg_trgm`; trusted on PostgreSQL 13+, so the database owner can create it) and
indexes for the directory's sort and activity queries.

`20260925090000_tenant_onboarding` adds `rndtechnosoft_email_deliveries` (CHECK that
the status matches its timestamps and a failure has a reason), `rndtechnosoft_tenant_onboardings`
(unique per workspace and per idempotency key) and `rndtechnosoft_account_setup_tokens`
(digest only, unique; at most one usable link per user by partial unique index).

`20260924120000_tenant_domains` adds `rndtechnosoft_tenant_domains` with CHECK
constraints on the label and hostname shape, unique subdomain and hostname
indexes, one primary address per workspace (partial unique index), and backfills an
address for every existing workspace from its tenant code.

## Tenant API authentication and isolation

The tenant API previously accepted any request and took the tenant from an
`x-tenant-id` header, so anyone could read any workspace's records without
credentials. That is fixed.

**Where the tenant comes from.** Sign-in creates a row in
`rndtechnosoft_user_sessions` that pins one tenant membership. `TenantAuthGuard`
resolves the bearer token to that row and sets both the identity and the tenant
from it. `TenantContextMiddleware` now runs first purely to clear any tenant
hint the caller supplied, so nothing downstream can observe one.

```text
Request → TenantAuthGuard → session row → tenantId + userId + roles
        → RolesGuard → controller → service → tenant-scoped query
```

**What is ignored.** `x-tenant-id`, `?tenantId=`, `body.tenantId` and any other
caller-supplied value have no effect on scope. Passing a tenant id to sign-in or
to the switch endpoint is treated as a request, not an assertion: it is honoured
only when the user is an active member, and refused with 403 otherwise. The
refusal is identical for a tenant that does not exist, so membership cannot be
probed.

**Switching workspaces** is a server call that re-checks membership and issues a
new session. Changing local state grants nothing.

**Re-checked on every request**, not just at sign-in: user status, membership
status and tenant status. Revoking a membership or suspending a tenant takes
effect immediately rather than at token expiry.

**Resource scoping.** Tenant-owned tables all carry a `[tenant_id, id]` unique
key. Reads and writes that previously used a bare id now use that composite key,
so the database refuses a cross-tenant write even if an id is guessed. Payroll
run calculate, approve and finalize, leave approval, attendance adjustment
approval and CRM lead cadence updates were all converted.

**Roles.** `RolesGuard` with `@RequireRoles(...)` reads role codes from the
session's membership. Holding ADMIN in one tenant grants nothing in another.

### Sign-in hardening

- scrypt hashing, matching the platform portal. Legacy SHA-256 hashes still
  verify and upgrade on next sign-in.
- Accounts with no password set can no longer sign in. Previously a null hash
  meant any password was accepted.
- Eight failed attempts locks the account for 15 minutes, plus the shared
  per-address and per-email throttle.
- `GET /auth/me` takes no user id. It used to return any user's record by id.
- `POST /auth/membership` requires ADMIN and adds members only to the caller's
  own tenant. It used to let anyone add anyone to any tenant.
- Unauthenticated tenant creation and the demo-seed endpoint were removed.

## Opening a tenant workspace

The portal does not sign in to, impersonate or open tenant workspaces. It shows each
workspace's stored records and acts on it only through the audited platform actions
(suspend, reactivate, change address, verify address).
