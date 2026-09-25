import {
  RESERVED_SUBDOMAINS,
  hostnameOf,
  normalizeSubdomain,
  positionOf,
  subdomainProblem,
} from '@/common/tenancy/subdomain';

describe('Workspace subdomain rules', () => {
  it('normalizes names and codes into one DNS label', () => {
    expect(normalizeSubdomain('RnD Technosoft')).toBe('rnd-technosoft');
    expect(normalizeSubdomain('RND_IN')).toBe('rnd-in');
    expect(normalizeSubdomain('  KPMG  ')).toBe('kpmg');
    expect(normalizeSubdomain('Acme & Co. (India)')).toBe('acme-co-india');
    expect(normalizeSubdomain('Café Münchën')).toBe('cafe-munchen');
    expect(normalizeSubdomain('__--weird--__')).toBe('weird');
    // Truncated to 63 characters without leaving a trailing hyphen.
    expect(normalizeSubdomain(`${'a'.repeat(62)}_b`)).toBe('a'.repeat(62));
  });

  it('accepts valid labels and explains every rejection', () => {
    expect(subdomainProblem('kpmg')).toBeNull();
    expect(subdomainProblem('rnd-in')).toBeNull();
    expect(subdomainProblem('a1')).toBeNull();
    expect(subdomainProblem('k')).toMatch(/at least 2/);
    expect(subdomainProblem('a'.repeat(64))).toMatch(/at most 63/);
    expect(subdomainProblem('Kpmg')).toMatch(/lower-case/);
    expect(subdomainProblem('kp_mg')).toMatch(/lower-case/);
    expect(subdomainProblem('-kpmg')).toMatch(/lower-case/);
    expect(subdomainProblem('kpmg-')).toMatch(/lower-case/);
    expect(subdomainProblem('kp--mg')).toMatch(/single hyphens/);
    expect(subdomainProblem('kp.mg')).toMatch(/lower-case/);
  });

  it('reserves every platform host this product uses', () => {
    for (const host of ['www', 'app', 'admin', 'superadmin', 'hq', 'api', 'erp', 'dev', 'new', 'mail', 'smtp', 'support', 'status', 'billing', 'static', 'cname', 'ssl', 'domainkey']) {
      expect([host, RESERVED_SUBDOMAINS.has(host), subdomainProblem(host)]).toEqual([host, true, expect.stringMatching(/reserved/)]);
    }
  });

  it('reads the hostname from a Host header safely', () => {
    expect(hostnameOf('KPMG.Voogyo.com:443')).toBe('kpmg.voogyo.com');
    expect(hostnameOf('kpmg.voogyo.com.')).toBe('kpmg.voogyo.com');
    expect(hostnameOf('[::1]:4000')).toBeNull();
    expect(hostnameOf('kpmg.voogyo.com/evil')).toBeNull();
    expect(hostnameOf('kpmg voogyo.com')).toBeNull();
    expect(hostnameOf(undefined)).toBeNull();
  });

  it('places a hostname relative to the base domain', () => {
    expect(positionOf('voogyo.com', 'voogyo.com')).toEqual({ kind: 'apex' });
    expect(positionOf('kpmg.voogyo.com', 'voogyo.com')).toEqual({ kind: 'subdomain', label: 'kpmg' });
    expect(positionOf('a.kpmg.voogyo.com', 'voogyo.com')).toEqual({ kind: 'nested' });
    // A lookalike suffix is not the base domain.
    expect(positionOf('kpmg.evilvoogyo.com', 'voogyo.com')).toEqual({ kind: 'foreign' });
    expect(positionOf('kpmg.voogyo.com.evil.net', 'voogyo.com')).toEqual({ kind: 'foreign' });
    expect(positionOf('localhost', 'voogyo.com')).toEqual({ kind: 'foreign' });
  });
});
