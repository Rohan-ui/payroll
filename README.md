# rndtechnosoft Payroll + HRMS SaaS

A production-grade multi-tenant Payroll and HRMS SaaS engineered for Indian SMEs and compliant with the Indian Code on Wages, EPFO, ESIC, State Professional Tax, and Income Tax (TDS Section 192).

---

## 📁 Repository Structure

- **[`/backend`](./backend)**: NestJS 10 + TypeScript + PostgreSQL 16 + Prisma ORM (Arbitrary-precision `Decimal/Numeric` money engine, multi-tenant isolation, explicit payroll lifecycle endpoints).
- **[`/frontend`](./frontend)**: React 18 + TypeScript + Vite + Tailwind CSS (Accessible UI with `A / A+ / A++` font scaling, 4 languages, 5-minute payroll wizard, WhatsApp payslip sharing, CMS bank formats).

---

## 🚀 Quick Start Guide

### 1. Backend Setup

```bash
cd backend
npm install
npm run prisma:generate
npm run dev
```
> **Note**: If `nest` is not installed globally in your system, running `nest start` directly will show `command not found: nest`. Always run `npm run dev` (which invokes local `nest start --watch`) or `npx nest start`.

The backend starts at `http://localhost:4000`. Detailed setup and API docs are in [`backend/README.md`](./backend/README.md).

---

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start at `http://localhost:5173`.

---

## 🏛️ Core Architectural Invariants

1. **Monetary Precision**: No JavaScript IEEE 754 binary floating-point numbers (`0.1 + 0.2 = 0.30000000000000004`). All calculations use `Prisma.Decimal` and PostgreSQL `NUMERIC` with deterministic `ROUND_HALF_UP` paise rounding.
2. **Multi-Tenancy**: Shared database with `tenant_id` column isolation across all 72 tables. Cross-tenant access is prevented server-side.
3. **Indian Statutory Compliance**:
   - **New Wage Code**: Basic + DA $\ge$ 50% of CTC.
   - **EPF**: 12% Employee + 12% Employer split (3.67% EPF + 8.33% EPS capped at ₹1,250), with configurable ₹15,000 wage ceiling toggle.
   - **ESIC**: 0.75% Employee + 3.25% Employer on gross $\le$ ₹21,000/month.
   - **Professional Tax**: State-specific slabs (e.g. Maharashtra ₹200/mo and ₹300 in Feb; Gujarat tiered slabs).
   - **TDS**: Section 192 tax deductions.
