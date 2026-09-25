import { describe, it, expect } from 'vitest';
import { describeUserAgent, formatRelative, humanize, initials, localDayEnd, localDayStart, seatUsage } from './format';
import { hashRoute, readHashRoute } from './hash-route';
import { toQueryString } from './api/platform-directory.api';

describe('platform directory formatting', () => {
  it('summarises a stored user agent without inventing one', () => {
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36')).toBe('Chrome on macOS');
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0')).toBe('Edge on Windows');
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS');
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(describeUserAgent('node-superagent/10.1.1')).toBeNull();
    expect(describeUserAgent(null)).toBeNull();
  });

  it('describes recent times relatively and older ones by date', () => {
    const now = Date.parse('2026-09-24T12:00:00Z');
    expect(formatRelative('2026-09-24T11:55:00Z', now)).toMatch(/5 minutes ago/);
    expect(formatRelative('2026-09-21T12:00:00Z', now)).toMatch(/3 days ago/);
    expect(formatRelative('2026-01-01T00:00:00Z', now)).toMatch(/2026/);
    expect(formatRelative(null, now)).toBeNull();
  });

  it('builds initials, labels and seat usage', () => {
    expect(initials('Ravi Shah', 'ravi@example.com')).toBe('RS');
    expect(initials(null, 'ravi.shah@example.com')).toBe('RS');
    expect(initials('Madonna', 'm@example.com')).toBe('MA');
    expect(humanize('TENANT_SUSPENDED')).toBe('Tenant suspended');
    expect(seatUsage(6, 5)).toBe('6 of 5');
    expect(seatUsage(3, null)).toBe('3 · no limit set');
  });

  it('turns calendar days into instants that cover the whole local day', () => {
    const start = new Date(localDayStart('2026-09-24'));
    const end = new Date(localDayEnd('2026-09-24'));
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([24, 0, 0]);
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([24, 23, 59]);
  });
});

describe('portal routes and queries', () => {
  it('reads and writes section/id routes', () => {
    expect(readHashRoute('#tenants/5b8e3c1e-0000-4000-8000-000000000000')).toEqual({
      section: 'tenants',
      id: '5b8e3c1e-0000-4000-8000-000000000000',
    });
    expect(readHashRoute('#users')).toEqual({ section: 'users', id: null });
    expect(readHashRoute('')).toEqual({ section: '', id: null });
    expect(hashRoute('users', 'abc')).toBe('#users/abc');
    expect(hashRoute('users')).toBe('#users');
  });

  it('sends only the filters that are set', () => {
    expect(toQueryString({ page: 1, pageSize: 25, search: '', status: undefined, moduleEnabled: false })).toBe(
      '?page=1&pageSize=25&moduleEnabled=false',
    );
    expect(toQueryString({})).toBe('');
  });
});
