#!/usr/bin/env node
/**
 * READ-ONLY. For a database that was built without `prisma migrate`, reports
 * which migrations in prisma/migrations its schema already contains, so they
 * can be marked applied (baselined) and the rest run with `migrate deploy`.
 *
 *   cd backend && node scripts/check-migration-state.cjs
 *
 * Uses DATABASE_URL from .env. Only SELECTs from the catalog; changes nothing.
 */
require('dotenv').config({ quiet: true });
const { readdirSync, readFileSync, existsSync } = require('fs');
const { join } = require('path');
const { PrismaClient } = require('@prisma/client');

const dir = join(__dirname, '..', 'prisma', 'migrations');
const migrations = readdirSync(dir)
  .filter((name) => existsSync(join(dir, name, 'migration.sql')))
  .sort();

const clean = (sql) => sql.replace(/--[^\n]*/g, '');
const ident = (s) => s.replace(/"/g, '').toLowerCase();

/** Objects each migration creates, and renames/nullability changes across all of them. */
const renames = { table: {}, index: {}, constraint: {} };
const plans = migrations.map((name) => {
  const sql = clean(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
  const expect = [];
  for (const statement of sql.split(';')) {
    const s = statement.trim();
    if (!s) continue;
    let m;
    if ((m = s.match(/^CREATE TABLE (?:IF NOT EXISTS )?("?[\w]+"?)/i))) expect.push({ kind: 'table', name: ident(m[1]) });
    if ((m = s.match(/^CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?("?[\w]+"?)/i))) expect.push({ kind: 'index', name: ident(m[1]) });
    if ((m = s.match(/^CREATE EXTENSION (?:IF NOT EXISTS )?("?[\w]+"?)/i))) expect.push({ kind: 'extension', name: ident(m[1]) });
    if ((m = s.match(/^ALTER INDEX ("?[\w]+"?) RENAME TO ("?[\w]+"?)/i))) renames.index[ident(m[1])] = ident(m[2]);
    const alter = s.match(/^ALTER TABLE (?:ONLY )?("?[\w]+"?)([\s\S]*)$/i);
    if (alter) {
      const table = ident(alter[1]);
      const body = alter[2];
      if ((m = body.match(/^\s*RENAME TO ("?[\w]+"?)/i))) renames.table[table] = ident(m[1]);
      for (const c of body.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?("?[\w]+"?)/gi)) expect.push({ kind: 'column', table, name: ident(c[1]) });
      for (const c of body.matchAll(/ADD CONSTRAINT ("?[\w]+"?)/gi)) expect.push({ kind: 'constraint', name: ident(c[1]) });
      for (const c of body.matchAll(/RENAME CONSTRAINT ("?[\w]+"?) TO ("?[\w]+"?)/gi)) renames.constraint[ident(c[1])] = ident(c[2]);
      for (const c of body.matchAll(/ALTER COLUMN ("?[\w]+"?) DROP NOT NULL/gi)) expect.push({ kind: 'nullable', table, name: ident(c[1]) });
    }
  }
  const hasData = /\bINSERT INTO\b|\bUPDATE \w/i.test(sql);
  return { name, expect, hasData, sql };
});

const finalName = (map, name) => {
  let current = name;
  for (let i = 0; i < 10 && map[current]; i += 1) current = map[current];
  return current;
};

(async () => {
  const prisma = new PrismaClient();
  try {
    const q = (text) => prisma.$queryRawUnsafe(text);
    const tables = new Set((await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`)).map((r) => r.table_name));
    const columns = new Map(
      (await q(`SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public'`)).map((r) => [
        `${r.table_name}.${r.column_name}`,
        r.is_nullable,
      ]),
    );
    const indexes = new Set((await q(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).map((r) => r.indexname));
    const constraints = new Set((await q(`SELECT conname FROM pg_constraint`)).map((r) => r.conname));
    const extensions = new Set((await q(`SELECT extname FROM pg_extension`)).map((r) => r.extname));

    console.log(`_prisma_migrations table: ${tables.has('_prisma_migrations') ? 'present' : 'absent'}\n`);
    const alreadyApplied = [];
    let blocked = false;
    for (const plan of plans) {
      const missing = [];
      for (const e of plan.expect) {
        const table = e.table ? finalName(renames.table, e.table) : null;
        const ok =
          e.kind === 'table' ? tables.has(finalName(renames.table, e.name))
          : e.kind === 'index' ? indexes.has(finalName(renames.index, e.name))
          : e.kind === 'constraint' ? constraints.has(finalName(renames.constraint, e.name))
          : e.kind === 'extension' ? extensions.has(e.name)
          : e.kind === 'column' ? columns.has(`${table}.${e.name}`)
          : e.kind === 'nullable' ? columns.get(`${table}.${e.name}`) === 'YES'
          : false;
        if (!ok) missing.push(`${e.kind} ${e.table ? `${e.table}.` : ''}${e.name}`);
      }
      const total = plan.expect.length;
      let verdict;
      if (total === 0) verdict = plan.hasData ? 'DATA ONLY   (safe to let migrate deploy run it)' : 'EMPTY';
      else if (missing.length === 0) { verdict = 'PRESENT     (mark as applied)'; alreadyApplied.push(plan.name); }
      else if (missing.length === total) verdict = 'ABSENT      (migrate deploy will create it)';
      else { verdict = `PARTIAL     ${total - missing.length}/${total} present`; blocked = true; }
      console.log(`${plan.name.padEnd(48)} ${verdict}`);
      if (verdict.startsWith('PARTIAL')) for (const m of missing.slice(0, 8)) console.log(`${' '.repeat(52)}missing: ${m}`);
    }

    // Status CHECK rules added by tenant_access_control: would existing rows violate them?
    if (tables.has('rndtechnosoft_roles') && !constraints.has('ck_roles_status')) {
      const plan = plans.find((p) => p.name.endsWith('tenant_access_control'));
      const allowed = (label) => (plan?.sql.match(new RegExp(`${label}[\\s\\S]*?IN \\(([^)]*)\\)`, 'i'))?.[1] ?? '').trim();
      console.log(`\nStatus values the tenant_access_control CHECK rules will allow: roles ${allowed('ck_roles_status')}; members ${allowed('ck_tenant_members_status')}`);
      console.log('Existing values:', JSON.stringify({
        role_status: (await q(`SELECT role_status AS v, count(*)::int AS n FROM rndtechnosoft_roles GROUP BY 1`)),
        membership_status: (await q(`SELECT membership_status AS v, count(*)::int AS n FROM rndtechnosoft_tenant_members GROUP BY 1`)),
      }));
    }

    console.log('\n' + (blocked
      ? 'A migration is only partly present. Do not baseline yet: send this output for a manual plan.'
      : alreadyApplied.length === 0
        ? 'Nothing to baseline.'
        : 'Baseline commands (review first, then run in this order):\n' + alreadyApplied.map((n) => `  npx prisma migrate resolve --applied ${n}`).join('\n') + '\nthen:\n  npx prisma migrate deploy'));
  } finally {
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
