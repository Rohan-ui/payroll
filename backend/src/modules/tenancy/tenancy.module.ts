import { Global, Module } from '@nestjs/common';
import { TenantDomainsService } from './tenant-domains.service';
import { DomainProvisioningService } from './domain-provisioning.service';

/** Workspace addresses: available everywhere, including the global tenant guard. */
@Global()
@Module({
  providers: [TenantDomainsService, DomainProvisioningService],
  exports: [TenantDomainsService, DomainProvisioningService],
})
export class TenancyModule {}
