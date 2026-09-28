/**
 * Workspace addresses: `<subdomain>.<PLATFORM_BASE_DOMAIN>`, for example
 * kpmg.voogyo.com. A subdomain is one DNS label, lower-case letters, digits
 * and single hyphens, and never a name the platform uses for itself.
 */

/**
 * Labels no workspace may take. Includes every platform hostname this product
 * and its predecessor use (app, admin, superadmin, hq, api, erp, dev, new),
 * DNS and mail names, and generic service names a customer could be misled by.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  // Platform and product hosts
  'www', 'app', 'apps', 'admin', 'administrator', 'superadmin', 'super-admin', 'hq', 'platform', 'console',
  'dashboard', 'portal', 'api', 'apis', 'erp', 'crm', 'hrms', 'payroll', 'voogyo', 'rndtechnosoft',
  'dev', 'development', 'staging', 'stage', 'test', 'testing', 'qa', 'uat', 'demo', 'sandbox', 'preview',
  'beta', 'alpha', 'new', 'old', 'legacy', 'next', 'internal', 'intranet', 'local', 'localhost',
  // Accounts and support
  'login', 'signin', 'signup', 'register', 'auth', 'sso', 'oauth', 'id', 'identity', 'account', 'accounts',
  'my', 'user', 'users', 'support', 'help', 'helpdesk', 'docs', 'documentation', 'status', 'billing', 'pay',
  'payment', 'payments', 'invoice', 'invoices', 'checkout', 'store', 'shop', 'blog', 'news', 'community',
  'forum', 'careers', 'jobs', 'legal', 'privacy', 'security', 'trust', 'abuse', 'noc', 'root', 'system',
  // Mail and DNS
  'mail', 'email', 'smtp', 'imap', 'pop', 'pop3', 'mx', 'webmail', 'autodiscover', 'autoconfig',
  'domainkey', 'dkim', 'spf', 'dmarc', 'ns', 'ns1', 'ns2', 'ns3', 'ns4', 'dns', 'cname', 'ssl', 'tls',
  'acme', 'mta-sts',
  // Infrastructure
  'static', 'assets', 'cdn', 'media', 'img', 'images', 'files', 'uploads', 'download', 'downloads', 'ftp',
  'sftp', 'ssh', 'vpn', 'proxy', 'gateway', 'lb', 'db', 'database', 'mysql', 'postgres', 'redis', 'cache',
  'phpmyadmin', 'pma', 'cpanel', 'whm', 'git', 'ci', 'jenkins', 'monitor', 'monitoring', 'metrics',
  'grafana', 'logs', 'health', 'ws', 'socket', 'webhook', 'webhooks', 'hooks', 'cron', 'jobs-worker',
]);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const MIN_SUBDOMAIN_LENGTH = 2;
export const MAX_SUBDOMAIN_LENGTH = 63;

/** Lower-case, hyphen-separated, trimmed to one DNS label: "RnD Technosoft" → "rnd-technosoft". */
export function normalizeSubdomain(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SUBDOMAIN_LENGTH)
    .replace(/-+$/g, '');
}

/** Why a label cannot be a workspace subdomain, or null when it can. */
export function subdomainProblem(label: string): string | null {
  if (label.length < MIN_SUBDOMAIN_LENGTH) return `Use at least ${MIN_SUBDOMAIN_LENGTH} characters.`;
  if (label.length > MAX_SUBDOMAIN_LENGTH) return `Use at most ${MAX_SUBDOMAIN_LENGTH} characters.`;
  if (!LABEL.test(label)) {
    return 'Use lower-case letters, numbers and single hyphens, starting and ending with a letter or number.';
  }
  if (label.includes('--')) return 'Use single hyphens only.';
  if (RESERVED_SUBDOMAINS.has(label)) return 'That address is reserved for the platform.';
  return null;
}

/**
 * Loopback addresses: how this machine, a developer's browser (through the dev
 * server's proxy) or a local health check reaches the API. They are never a
 * workspace address or someone else's domain. The reverse proxy passes the
 * public host name, so production requests never arrive with one of these.
 */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  if (/^\[::1\](:\d+)?$/.test(host)) return true;
  const hostname = host.replace(/:\d+$/, '').replace(/\.$/, '');
  return hostname === 'localhost' || hostname.endsWith('.localhost') || /^127(\.\d{1,3}){3}$/.test(hostname);
}

/** The hostname of a Host header value, lower-cased, without port or trailing dot; null when unusable. */
export function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.trim().toLowerCase();
  // IPv6 literals ([::1]:4000) are never workspace hosts.
  if (host.startsWith('[')) return null;
  const hostname = host.replace(/:\d+$/, '').replace(/\.$/, '');
  return /^[a-z0-9.-]{1,253}$/.test(hostname) ? hostname : null;
}

/**
 * Where a hostname sits relative to the platform's base domain:
 * - `apex`: the base domain itself;
 * - `subdomain`: exactly one label under it (`kpmg` for kpmg.voogyo.com);
 * - `nested`: deeper names (a.b.voogyo.com), which are never workspaces;
 * - `foreign`: anything else.
 */
export type HostPosition =
  | { kind: 'apex' }
  | { kind: 'subdomain'; label: string }
  | { kind: 'nested' }
  | { kind: 'foreign' };

export function positionOf(hostname: string, baseDomain: string): HostPosition {
  const base = baseDomain.toLowerCase().replace(/\.$/, '');
  if (hostname === base) return { kind: 'apex' };
  if (!hostname.endsWith(`.${base}`)) return { kind: 'foreign' };
  const prefix = hostname.slice(0, -(base.length + 1));
  return prefix.includes('.') ? { kind: 'nested' } : { kind: 'subdomain', label: prefix };
}
