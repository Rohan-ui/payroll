import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { randomUUID } from 'crypto';

export interface CreateTenantInput {
  tenantCode: string;
  legalName: string;
  displayName: string;
  countryCode?: string;
  defaultCurrencyCode?: string;
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(input: CreateTenantInput) {
    const existing = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { tenant_code: input.tenantCode },
    });

    if (existing) {
      throw new ConflictException(`Tenant with code '${input.tenantCode}' already exists`);
    }

    const tenantId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.rndtechnosoft_tenants.create({
        data: {
          id: tenantId,
          tenant_code: input.tenantCode,
          legal_name: input.legalName,
          display_name: input.displayName,
          country_code: input.countryCode || 'IN',
          default_currency_code: input.defaultCurrencyCode || 'INR',
          tenant_status: 'ACTIVE',
        },
      });

      // Default tenant settings
      await tx.rndtechnosoft_tenant_settings.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          settings: {
            payroll: {
              payFrequency: 'MONTHLY',
              currency: input.defaultCurrencyCode || 'INR',
              workingDaysPerMonth: 30,
            },
            timezone: 'Asia/Kolkata',
          },
        },
      });

      return tenant;
    });
  }
}
