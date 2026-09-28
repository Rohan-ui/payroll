/**
 * A DNS host that holds the platform's zone. The application talks to this
 * interface only, so a provider other than GoDaddy can be added later.
 * Credentials live in the server environment and never leave the provider.
 */

export const DNS_PROVIDER = Symbol('DNS_PROVIDER');

export interface DnsRecord {
  type: string;
  /** Relative to the zone: '@' is the domain itself, '*' the wildcard. */
  name: string;
  data: string;
  ttl: number;
  priority?: number | null;
}

export type DnsRecordValue = Omit<DnsRecord, 'type' | 'name'>;

export interface DnsDomainInfo {
  domain: string;
  status: string | null;
  expiresAt: string | null;
  nameServers: string[];
}

export type DnsProviderErrorKind = 'NOT_CONFIGURED' | 'AUTH' | 'NOT_FOUND' | 'INVALID' | 'RATE_LIMITED' | 'UNAVAILABLE';

/** A provider failure whose message is safe to show: it never contains credentials. */
export class DnsProviderError extends Error {
  constructor(
    message: string,
    readonly kind: DnsProviderErrorKind,
  ) {
    super(message);
    this.name = 'DnsProviderError';
  }
}

export interface DnsProvider {
  readonly name: string;
  isConfigured(): boolean;
  getDomain(domain: string): Promise<DnsDomainInfo>;
  listRecords(domain: string): Promise<DnsRecord[]>;
  /** Adds records alongside those already there. */
  addRecords(domain: string, records: DnsRecord[]): Promise<void>;
  /** Replaces every record of one type and name with the given values. */
  replaceRecords(domain: string, type: string, name: string, values: DnsRecordValue[]): Promise<void>;
  /** Removes every record of one type and name. */
  deleteRecords(domain: string, type: string, name: string): Promise<void>;
}
