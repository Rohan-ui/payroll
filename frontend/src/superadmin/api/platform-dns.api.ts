import { platformApi } from './platform-client';

const BASE = '/api/v1/super-admin/dns';

export interface DnsVerification {
  at: string;
  verified: boolean;
  checks: { check: string; verified: boolean; detail: string }[];
}

export interface DnsOverview {
  domain: string | null;
  provider: string;
  providerConfigured: boolean;
  reachable: boolean;
  domainStatus: string | null;
  expiresAt: string | null;
  nameServers: string[];
  expectedAddresses: string[];
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  lastVerification: DnsVerification | null;
  error: string | null;
}

export interface DnsRecord {
  type: string;
  name: string;
  data: string;
  ttl: number;
  priority: number | null;
  editable: boolean;
}

export interface DnsRecordValue {
  data: string;
  ttl: number;
  priority?: number | null;
}

/** Types that can be changed from HQ; the rest are shown read-only. */
export const EDITABLE_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT'] as const;
export const MIN_TTL = 600;

const recordPath = (type: string, name: string) => `${BASE}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`;

export const platformDnsApi = {
  overview: () => platformApi.get<DnsOverview>(BASE),
  records: () => platformApi.get<{ domain: string; syncedAt: string; records: DnsRecord[] }>(`${BASE}/records`),
  create: (record: { type: string; name: string } & DnsRecordValue) => platformApi.post(`${BASE}/records`, record),
  replace: (type: string, name: string, values: DnsRecordValue[]) => platformApi.put(recordPath(type, name), { values }),
  remove: (type: string, name: string) => platformApi.delete(recordPath(type, name)),
  configureWildcard: () => platformApi.put<{ name: string; addresses: string[] }>(`${BASE}/wildcard`),
  verify: () => platformApi.post<DnsVerification>(`${BASE}/verify`),
};
