import { Module } from '@nestjs/common';
import { DNS_PROVIDER } from './dns-provider';
import { GoDaddyDnsProvider } from './godaddy-dns.provider';
import { PlatformDnsService } from './platform-dns.service';

/** The platform's DNS zone at its provider (GoDaddy). Used only by the platform console. */
@Module({
  providers: [{ provide: DNS_PROVIDER, useClass: GoDaddyDnsProvider }, PlatformDnsService],
  exports: [PlatformDnsService],
})
export class DnsModule {}
