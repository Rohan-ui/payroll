import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * What a member may see comes from the server (access.permissions and
 * access.navigation), which derives it from the role's permission rows. The
 * tenant app must not decide access from role codes or keep its own lists of
 * who may see what.
 */

const SOURCE_ROOT = join(process.cwd(), 'src');

// The platform console authenticates super admins separately and is out of scope.
const OUT_OF_SCOPE = [/^superadmin\//, /^components\/super-admin\//];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

const tenantFiles = sourceFiles(SOURCE_ROOT)
  .map((file) => relative(SOURCE_ROOT, file).replace(/\\/g, '/'))
  .filter((name) => !OUT_OF_SCOPE.some((pattern) => pattern.test(name)));

const read = (name: string) => readFileSync(join(SOURCE_ROOT, name), 'utf8');

describe('tenant access control in the client', () => {
  it('finds the tenant app sources', () => {
    expect(tenantFiles.length).toBeGreaterThan(20);
  });

  it('never grants or hides anything by comparing role codes', () => {
    const roleComparison = /\brole\s*[!=]==?\s*['"][A-Z_]+['"]|\broles?\.includes\(\s*['"][A-Z_]+['"]\s*\)/;
    const offenders = tenantFiles.filter((name) => roleComparison.test(read(name)));
    expect(offenders).toEqual([]);
  });

  it('keeps no role-code lists deciding navigation', () => {
    const roleList = /roles\s*:\s*\[\s*['"](ADMIN|HR_ACCOUNTANT|MANAGER|EMPLOYEE)['"]/;
    const offenders = tenantFiles.filter((name) => roleList.test(read(name)));
    expect(offenders).toEqual([]);
  });

  it('builds the sidebar and routing from the server navigation', () => {
    expect(read('components/layout/Sidebar.tsx')).toMatch(/sidebarTree\(navigation\)/);
    expect(read('components/layout/MobileNav.tsx')).toMatch(/canOpen\(/);
    expect(read('App.tsx')).toMatch(/navigationEntry\(/);
  });

  it('keeps no sidebar labels, grouping or module structure of its own', () => {
    // The server sends each item's label, group and order; the client maps ids to icons and views.
    for (const name of ['components/layout/Sidebar.tsx', 'components/layout/navigation.ts']) {
      const source = read(name);
      expect([name, source.match(/\b(label|parent|module)\s*:/g)]).toEqual([name, null]);
      expect([name, source.match(/'(CRM|HRMS|FINANCE|PAYROLL|Finance|People|Attendance|Payroll|Payslips|Bookkeeping)'/g)]).toEqual([name, null]);
    }
  });

  it('loads the permission catalog from the API instead of listing it', () => {
    const settings = read('views/OrganizationSettingsView.tsx');
    expect(settings).toMatch(/\/api\/v1\/permissions/);
    // A hardcoded catalog would repeat many keys; the page references only the few it gates actions on.
    const distinctKeys = new Set(settings.match(/'[a-z_]+\.[a-z_.]+'/g) ?? []);
    expect(distinctKeys.size).toBeLessThan(20);
  });
});
