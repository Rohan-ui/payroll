# rndtechnosoft Payroll + HRMS SaaS — Backend

Enterprise-grade multi-tenant Payroll and HRMS backend built with **NestJS**, **TypeScript**, **PostgreSQL 16+**, and **Prisma ORM**.

---

## ⚡ Quick Start

### 1. Why `nest start` or `nest build` gives `zsh: command not found: nest`?
The Nest CLI is installed locally inside `devDependencies` in `node_modules`, not globally in your shell path.
Always prefix commands with **`npm run ...`** or **`npx`**:

```bash
# Recommended: Run through npm scripts
npm run dev          # Starts development server with hot-reload (nest start --watch)
npm run build        # Builds the TypeScript code to /dist (nest build)

# Alternatively, using npx:
npx nest start --watch
npx nest build
```

---

## 🛠️ Prerequisites

- **Node.js**: v18.x or v20.x+
- **PostgreSQL**: 16+ (or 15+)
- **npm**: v9+ or v10+

---

## ⚙️ Step-by-Step Setup Guide

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (or verify your existing `.env`):
```bash
cp .env.example .env
```

Ensure your `.env` contains valid PostgreSQL credentials:
```env
NODE_ENV=development
PORT=4000
DATABASE_URL="postgresql://bhavin-pathak:postgres@localhost:5432/rndtechnosoft_payroll?schema=public"
JWT_SECRET="replace_with_a_secure_random_secret"
```

### 3. Database & Prisma Setup
The database uses 72 relational physical tables (`rndtechnosoft_...`) with composite tenant-aware foreign keys.

```bash
# 1. Generate Prisma Client
npm run prisma:generate

# 2. Apply existing migrations (baseline init)
npm run prisma:deploy

# 3. (Optional) Open Prisma Studio visual DB GUI in your browser:
npm run prisma:studio
```

---

## 🚀 Running the Application

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts server in watch/hot-reload mode on port `4000` |
| `npm run start:dev` | Alias for `npm run dev` |
| `npm run build` | Compiles the project to `dist/` |
| `npm run start:prod` | Runs the compiled production code (`dist/main.js`) |

Once started, test the server health:
```bash
curl http://localhost:4000/health
# Response: {"status":"ok","timestamp":"...","database":"connected"}
```

---

## 🏗️ Architecture & Core Principles

### 1. Arbitrary Precision Money (No Floating Point)
All monetary amounts (basic, gross, HRA, EPF, ESIC, PT, TDS, net pay, loan balances) use PostgreSQL `NUMERIC(p,s)` mapped to `Prisma.Decimal`.
The calculation utility (`src/common/utils/decimal-math.util.ts`) ensures that:
- Every intermediate operation uses Decimal instances with `ROUND_HALF_UP` paise rounding.
- JavaScript binary floating-point (`0.1 + 0.2 = 0.30000000000000004`) is strictly forbidden.

### 2. Strict Multi-Tenancy
- Every tenant-owned table features a `tenant_id` column.
- Incoming requests resolve tenant context via `x-tenant-id` header or authenticated JWT membership.
- Server-side queries strictly isolate records by `tenant_id` to prevent cross-tenant leakage.

---

## 📡 API Modules & Endpoints

All tenant-scoped endpoints accept an `x-tenant-id` header (or auth Bearer token):

| Module | Route Prefix | Key Endpoints | Description |
| :--- | :--- | :--- | :--- |
| **Health** | `/health` | `GET /health` | Service and database connectivity health check |
| **Tenants** | `/tenants` | `GET /tenants/current`<br>`PATCH /tenants/current` | Tenant profile & configuration |
| **Auth** | `/auth` | `POST /auth/login`<br>`GET /auth/me` | Authentication & user session info |
| **Employees** | `/employees` | `GET /employees`<br>`POST /employees`<br>`GET /employees/:id` | Employee master, identity, and employment records |
| **Attendance** | `/attendance` | `GET /attendance/records`<br>`POST /attendance/punches` | Biometric punches and daily attendance calculation |
| **Leave** | `/leave` | `GET /leave/types`<br>`GET /leave/balances`<br>`POST /leave/applications` | Leave types, allocations, and requests |
| **Salary** | `/salary` | `GET /salary/components`<br>`GET /salary/structures`<br>`POST /salary/assignments` | Salary components, structures, and effective-dated pay |
| **Payroll** | `/payroll-runs` | `GET /payroll-runs`<br>`POST /payroll-runs`<br>`POST /payroll-runs/:id/calculate`<br>`POST /payroll-runs/:id/approve`<br>`POST /payroll-runs/:id/finalize` | Explicit lifecycle transitions for monthly payroll |
| **Audit** | `/audit-logs` | `GET /audit-logs` | Immutable audit trail for security & financial changes |

---

## 🔧 Troubleshooting

- **`zsh: command not found: nest`**:
  Run via `npm run dev` or `npx nest start` instead of typing `nest` directly.
- **`P1001: Can't reach database server at localhost:5432`**:
  Verify PostgreSQL is running: `sudo systemctl status postgresql` or check database credentials in `.env`.
- **`Port 4000 already in use`**:
  Change `PORT=4001` in `.env` or terminate the process occupying port 4000: `npx kill-port 4000`.
- **Prisma Model Type Mismatches**:
  Re-generate Prisma client after any schema change: `npm run prisma:generate`.
