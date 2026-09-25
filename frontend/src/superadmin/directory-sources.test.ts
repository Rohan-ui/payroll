import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

/**
 * Platform HQ shows stored records only. The screens it replaced shipped
 * sample people, addresses, devices, activity and random metrics, so these
 * checks keep sample values from coming back as fallbacks, and keep every
 * screen on the theme tokens so Light and Dark both work.
 */

const SOURCE_ROOT = join(process.cwd(), 'src', 'superadmin');

const listSources = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [relative(SOURCE_ROOT, path)] : [];
  });

const PORTAL_SOURCES = listSources(SOURCE_ROOT);

const read = (name: string) => readFileSync(join(SOURCE_ROOT, name), 'utf8');

const SAMPLE_VALUES: [string, RegExp][] = [
  ['a sample person', /Ravi Shah|Vikram Mehta|Ananya Deshmukh/],
  ['an IP address literal', /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/],
  ['a device model', /MacBook|Latitude|iPhone 1\d/],
  ['a city', /Ahmedabad|Surat|Bengaluru|Mumbai/],
  ['a phone number', /\+91[\s-]?\d{4,}/],
  ['sample activity', /Active in CRM|Generated GST|Configured GitHub/],
  ['an invitation link', /invite\/accept|token=inv_/],
  ['a random number', /Math\.random/],
];

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black|darkGreen|dark-green';
const RAW_COLOUR = new RegExp(
  `\\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|outline|shadow|accent|caret|decoration)-(?:${PALETTE})\\b`,
);

describe('platform HQ sources', () => {
  it('finds the portal sources', () => {
    expect(PORTAL_SOURCES).toContain('views/TenantDirectoryView.tsx');
    expect(PORTAL_SOURCES).toContain('views/CommandCentreView.tsx');
  });

  it.each(PORTAL_SOURCES)('%s contains no sample data', (name) => {
    const source = read(name);
    const found = SAMPLE_VALUES.filter(([, pattern]) => pattern.test(source)).map(([label]) => label);
    expect(found).toEqual([]);
  });

  it('reads tenants and users only through the platform directory API', () => {
    const api = read('api/platform-directory.api.ts');
    expect(api).toMatch(/from '\.\/platform-client'/);
    for (const name of PORTAL_SOURCES.filter((file) => file.startsWith('views/'))) {
      expect([name, /\bfetch\s*\(/.test(read(name))]).toEqual([name, false]);
    }
  });

  it.each(PORTAL_SOURCES)('%s uses theme tokens, not fixed colours', (name) => {
    const source = read(name);
    expect(source.match(RAW_COLOUR)?.[0] ?? null).toBeNull();
    expect(source.match(/\bdark:[\w-]/)?.[0] ?? null).toBeNull();
  });

  it.each(PORTAL_SOURCES)('%s does not import the removed sample-data screens', (name) => {
    expect(read(name)).not.toMatch(/components\/super-admin|platform\.types/);
  });

  it('lets the saved theme decide instead of forcing dark', () => {
    const html = readFileSync(join(process.cwd(), 'superadmin.html'), 'utf8');
    expect(html).not.toMatch(/class="[^"]*\bdark\b/);
    expect(html).toMatch(/<script src="\/hq-theme\.js"><\/script>/);
    expect(read('main.tsx')).not.toMatch(/classList\.add\(['"]dark['"]\)/);
  });

  it('opens User Management on the real directory', () => {
    const console = read('views/PlatformConsoleView.tsx');
    expect(console).toMatch(/case 'users':\s+return <UserDirectoryView \/>/);
    expect(console).not.toMatch(/SmartUserManagementView/);
  });
});
