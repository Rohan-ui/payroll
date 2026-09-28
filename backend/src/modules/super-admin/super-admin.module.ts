import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminAuthService } from './auth/super-admin-auth.service';
import { SuperAdminMfaService } from './auth/super-admin-mfa.service';
import { LoginThrottleService } from '@/common/security/login-throttle.service';
import { SuperAdminAuthGuard } from './auth/super-admin-auth.guard';
import { PrismaModule } from '@/prisma/prisma.module';
import { TenantsModule } from '@/modules/tenants/tenants.module';
import { ExternalApiModule } from '@/modules/external-api/external-api.module';
import { PlatformDirectoryService } from './platform-directory.service';
import { PlatformCommandCentreService } from './platform-command-centre.service';
import { PlatformGovernanceService } from './platform-governance.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { PlatformOperationsService } from './platform-operations.service';
import { PlatformRoleTemplatesService } from './platform-role-templates.service';
import { DnsModule } from '@/modules/dns/dns.module';

@Module({
  imports: [PrismaModule, TenantsModule, ExternalApiModule, DnsModule],
  controllers: [SuperAdminController],
  providers: [
    SuperAdminService,
    PlatformDirectoryService,
    PlatformCommandCentreService,
    PlatformGovernanceService,
    TenantProvisioningService,
    PlatformOperationsService,
    PlatformRoleTemplatesService,
    SuperAdminAuthService,
    SuperAdminMfaService,
    LoginThrottleService,
    SuperAdminAuthGuard,
  ],
  exports: [SuperAdminService, SuperAdminAuthService, SuperAdminMfaService],
})
export class SuperAdminModule {}
